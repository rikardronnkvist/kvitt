import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, LockKeyhole } from 'lucide-react';
import { post } from '../api/client.js';

const loginInitialState = { email: '', password: '' };
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
  const [loginForm, setLoginForm] = useState(loginInitialState);
  const [registerForm, setRegisterForm] = useState(registerInitialState);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const isRegisterMode = mode === 'register';

  useEffect(() => {
    setMode(isRegisterRoute ? 'register' : 'login');
  }, [isRegisterRoute]);

  const handleChange = (setter) => (event) => {
    const { name, value } = event.target;
    setter((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload = mode === 'login' ? loginForm : registerForm;
      const response = await post(endpoint, payload);
      localStorage.setItem('token', response.token);
      navigate('/');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeySignup = async () => {
    setError('');
    setPasskeyLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    setPasskeyLoading(false);
    setError('Passkey-registrering kommer snart.');
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
            <AuthModeButton active={mode === 'login'} onClick={() => setMode('login')} disabled={loading || passkeyLoading}>
              Logga in
            </AuthModeButton>
            <AuthModeButton active={mode === 'register'} onClick={() => setMode('register')} disabled={loading || passkeyLoading}>
              Skapa konto
            </AuthModeButton>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegisterMode ? (
            <>
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={handlePasskeySignup}
                  className="btn-secondary w-full justify-start border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,white)] text-[var(--text-primary)] hover:bg-[color:color-mix(in_srgb,var(--accent)_16%,white)]"
                  disabled={passkeyLoading || loading}
                >
                  <KeyRound className="h-4 w-4 text-[var(--accent)]" />
                  {passkeyLoading ? 'Startar Passkey...' : 'Skapa konto med Passkey'}
                </button>
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-[var(--border-subtle)]" />
                  <span className="text-xs text-[var(--text-muted)]">eller fortsätt med e-post</span>
                  <span className="h-px flex-1 bg-[var(--border-subtle)]" />
                </div>
              </div>
              <label className="field-label">
                Fullständigt namn
                <input name="full_name" value={registerForm.full_name} onChange={handleChange(setRegisterForm)} required />
              </label>
            </>
          ) : null}

          <label className="field-label">
            E-post
            <input
              name="email"
              type="email"
              value={isRegisterMode ? registerForm.email : loginForm.email}
              onChange={isRegisterMode ? handleChange(setRegisterForm) : handleChange(setLoginForm)}
              required
            />
          </label>

          <label className="field-label">
            Lösenord
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                className="pl-10"
                name="password"
                type="password"
                value={isRegisterMode ? registerForm.password : loginForm.password}
                onChange={isRegisterMode ? handleChange(setRegisterForm) : handleChange(setLoginForm)}
                required
              />
            </div>
          </label>

          {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

          <button type="submit" className="btn-primary w-full" disabled={loading || passkeyLoading}>
            {loading ? 'Sparar...' : isRegisterMode ? 'Skapa konto' : 'Fortsätt'}
            {!loading ? <ArrowRight className="h-4 w-4" /> : null}
          </button>
        </form>
      </section>
    </main>
  );
}
