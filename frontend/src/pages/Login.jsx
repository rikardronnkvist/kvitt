import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { post } from '../api/client.js';
import PasskeyButton from '../components/PasskeyButton.jsx';
import { usePasskeyAuth } from '../hooks/usePasskeyAuth.js';

const registerInitialState = { email: '', password: '', full_name: '' };

function AuthModeButton({ active, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'min-h-11 rounded-lg border px-4 text-sm font-semibold transition',
        active
          ? 'border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)] text-[var(--text-primary)]'
          : 'border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--app-surface-muted)]',
        disabled ? 'cursor-not-allowed opacity-60' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const isRegisterRoute = useMemo(() => location.pathname === '/register', [location.pathname]);
  const [mode, setMode] = useState(isRegisterRoute ? 'register' : 'login');
  const [registerForm, setRegisterForm] = useState(registerInitialState);
  const [devboxUsers, setDevboxUsers] = useState([]);
  const [devboxAvailable, setDevboxAvailable] = useState(false);
  const [devboxLoading, setDevboxLoading] = useState(false);
  const [devboxLoginLoading, setDevboxLoginLoading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isRegisterMode = mode === 'register';
  const { passkeyLoading, handlePasskeySignup, handlePasskeyLogin } = usePasskeyAuth({ navigate, setError });
  const isBusy = loading || passkeyLoading || devboxLoading || devboxLoginLoading;

  useEffect(() => {
    setMode(isRegisterRoute ? 'register' : 'login');
  }, [isRegisterRoute]);

  useEffect(() => {
    if (isRegisterMode) {
      return;
    }

    let active = true;
    setDevboxLoading(true);

    fetch('/api/auth/devbox/users')
      .then(async (response) => {
        if (!active) return;
        if (response.status === 404) {
          setDevboxAvailable(false);
          setDevboxUsers([]);
          return;
        }

        if (!response.ok) {
          let message = 'Kunde inte ladda testanvändare.';
          try {
            const data = await response.json();
            message = data.error || message;
          } catch {
            message = response.statusText || message;
          }
          throw new Error(message);
        }

        const data = await response.json();
        setDevboxUsers(Array.isArray(data.users) ? data.users : []);
        setDevboxAvailable(true);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError.message || 'Kunde inte ladda testanvändare.');
        setDevboxAvailable(false);
        setDevboxUsers([]);
      })
      .finally(() => {
        if (active) {
          setDevboxLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [isRegisterMode]);

  const handleChange = (setter) => (event) => {
    const { name, value } = event.target;
    setter((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isRegisterMode) {
      return;
    }
    setError('');
    setLoading(true);
    try {
      const response = await post('/api/auth/register', registerForm);
      localStorage.setItem('token', response.token);
      navigate('/');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  const onPasskeySignup = async () => {
    const initialName = registerForm.full_name.trim();
    const promptedName = window.prompt('Ange visningsnamn för ditt konto', initialName);
    if (promptedName === null) {
      setError('Registreringen avbröts');
      return;
    }

    const displayName = promptedName.trim();
    if (!displayName) {
      setError('Registreringen avbröts');
      return;
    }

    setRegisterForm((current) => ({ ...current, full_name: displayName }));
    await handlePasskeySignup(displayName);
  };

  const handleDevboxUserLogin = async (userId) => {
    setError('');
    setDevboxLoginLoading(true);
    try {
      const response = await post('/api/auth/devbox/login', { user_id: userId });
      localStorage.setItem('token', response.token);
      navigate('/');
    } catch (loginError) {
      setError(loginError.message || 'Kunde inte logga in testanvändare.');
    } finally {
      setDevboxLoginLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4 py-12">
      <section className="surface-card w-full max-w-[420px] space-y-8 p-7 sm:p-8">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-lg bg-[var(--app-surface-muted)]">
              <img src="/kvitt.png" alt="Kvitt logo" className="h-16 w-16 object-contain" />
            </div>
            <div className="space-y-1">
              <h1 className="page-title">Logga in på Kvitt</h1>
              <p className="m-0 text-sm text-[var(--text-secondary)]">#teambail on tour</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AuthModeButton active={mode === 'login'} onClick={() => setMode('login')} disabled={isBusy}>
              Logga in
            </AuthModeButton>
            <AuthModeButton active={mode === 'register'} onClick={() => setMode('register')} disabled={isBusy}>
              Skapa konto
            </AuthModeButton>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <PasskeyButton
              label={isRegisterMode ? 'Skapa konto med Passkey' : 'Logga in med Passkey'}
              loadingLabel="Startar Passkey..."
              loading={passkeyLoading}
              disabled={isBusy}
              onClick={isRegisterMode ? onPasskeySignup : handlePasskeyLogin}
            />
            {isRegisterMode ? (
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-[var(--border-subtle)]" />
                <span className="text-xs text-[var(--text-muted)]">eller fortsätt med e-post</span>
                <span className="h-px flex-1 bg-[var(--border-subtle)]" />
              </div>
            ) : null}
          </div>

          {isRegisterMode ? (
            <>
              <label className="field-label">
                Fullständigt namn
                <input name="full_name" value={registerForm.full_name} onChange={handleChange(setRegisterForm)} required />
              </label>
              <label className="field-label">
                E-post
                <input
                  name="email"
                  type="email"
                  value={registerForm.email}
                  onChange={handleChange(setRegisterForm)}
                  required
                />
              </label>
              <label className="field-label">
                Lösenord
                <input
                  name="password"
                  type="password"
                  value={registerForm.password}
                  onChange={handleChange(setRegisterForm)}
                  required
                />
              </label>
            </>
          ) : null}

          {!isRegisterMode && devboxAvailable ? (
            <div className="space-y-3">
              <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Devbox</p>
              <div className="space-y-2">
                {devboxUsers.length ? devboxUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className="btn-secondary w-full justify-start"
                    onClick={() => handleDevboxUserLogin(user.id)}
                    disabled={isBusy}
                  >
                    <span className="flex flex-col items-start gap-0.5">
                      <span>{user.name}</span>
                      {user.subtitle ? <span className="text-xs text-[var(--text-muted)]">{user.subtitle}</span> : null}
                    </span>
                  </button>
                )) : (
                  <p className="m-0 text-sm text-[var(--text-secondary)]">Inga användare hittades.</p>
                )}
              </div>
            </div>
          ) : null}

          {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

          {isRegisterMode ? (
            <button type="submit" className="btn-primary w-full" disabled={isBusy}>
              {loading ? 'Sparar...' : 'Skapa konto'}
              {!loading ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
          ) : null}

          <p className="m-0 text-sm text-[var(--text-secondary)]">
            {mode === 'login' ? (
              <>
                Har du inget konto? <Link to="/register">Registrera dig</Link>
              </>
            ) : (
              <>
                Har du redan ett konto? <Link to="/login">Logga in</Link>
              </>
            )}
          </p>
        </form>
      </section>
    </main>
  );
}
