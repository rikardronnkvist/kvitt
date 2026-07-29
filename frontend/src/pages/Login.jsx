import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { get, post } from '../api/client.js';
import PasskeyButton from '../components/PasskeyButton.jsx';
import { usePasskeyAuth } from '../hooks/usePasskeyAuth.js';

const registerInitialState = { full_name: '', phone: '' };

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const isRegisterRoute = useMemo(() => location.pathname === '/register', [location.pathname]);
  const registrationToken = useMemo(() => {
    const raw = location.search.startsWith('?') ? location.search.slice(1) : '';
    if (!raw) return '';
    if (!raw.includes('=')) {
      return decodeURIComponent(raw);
    }
    const params = new URLSearchParams(location.search);
    return params.get('token') || params.get('invite') || params.get('key') || '';
  }, [location.search]);
  const [registerForm, setRegisterForm] = useState(registerInitialState);
  const [devboxUsers, setDevboxUsers] = useState([]);
  const [devboxAvailable, setDevboxAvailable] = useState(false);
  const [devboxLoading, setDevboxLoading] = useState(false);
  const [devboxLoginLoading, setDevboxLoginLoading] = useState(false);
  const [checkingRegistrationToken, setCheckingRegistrationToken] = useState(false);
  const [registrationTokenChecked, setRegistrationTokenChecked] = useState(false);
  const [registrationTokenValid, setRegistrationTokenValid] = useState(false);
  const [error, setError] = useState('');
  const isRegisterMode = isRegisterRoute;
  const hasRegistrationToken = registrationToken.trim().length > 0;
  const hasValidRegistrationToken = hasRegistrationToken && registrationTokenValid;
  const hasValidRegisterName = registerForm.full_name.trim().length >= 3;
  const { passkeyLoading, handlePasskeySignup, handlePasskeyLogin } = usePasskeyAuth({ navigate, setError });
  const isBusy = passkeyLoading || devboxLoading || devboxLoginLoading || checkingRegistrationToken;

  useEffect(() => {
    if (!isRegisterMode) {
      return;
    }

    if (!hasRegistrationToken) {
      setRegistrationTokenChecked(true);
      setRegistrationTokenValid(false);
      return;
    }

    let active = true;
    setCheckingRegistrationToken(true);
    setRegistrationTokenChecked(false);
    setRegistrationTokenValid(false);

    get(`/api/auth/passkey/register-access?token=${encodeURIComponent(registrationToken)}`)
      .then((data) => {
        if (!active) return;
        setRegistrationTokenValid(Boolean(data.allowed));
      })
      .catch(() => {
        if (!active) return;
        setRegistrationTokenValid(false);
      })
      .finally(() => {
        if (active) {
          setCheckingRegistrationToken(false);
          setRegistrationTokenChecked(true);
        }
      });

    return () => {
      active = false;
    };
  }, [isRegisterMode, hasRegistrationToken, registrationToken]);

  useEffect(() => {
    if (!isRegisterMode || checkingRegistrationToken || !registrationTokenChecked) {
      return;
    }
    if (!hasRegistrationToken || !hasValidRegistrationToken) {
      navigate('/login');
    }
  }, [checkingRegistrationToken, hasRegistrationToken, hasValidRegistrationToken, isRegisterMode, navigate, registrationTokenChecked]);

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

  const onPasskeySignup = async () => {
    const displayName = registerForm.full_name.trim();
    if (displayName.length < 3) {
      setError('Ange minst 3 tecken i namnet.');
      return;
    }

    if (!hasValidRegistrationToken) {
      setError('Registrering är stängd. Be admin om registreringslänk.');
      return;
    }

    await handlePasskeySignup(displayName, registerForm.phone.trim(), registrationToken);
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
        </div>

        <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
          {isRegisterMode ? (
            <>
              {!hasRegistrationToken ? (
                <p className="m-0 rounded-lg border border-[var(--border-strong)] bg-[var(--app-surface-muted)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                  Registrering är stängd. Be en administratör om registreringslänk.
                </p>
              ) : checkingRegistrationToken ? (
                <p className="m-0 rounded-lg border border-[var(--border-strong)] bg-[var(--app-surface-muted)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                  Verifierar registreringslänken...
                </p>
              ) : !hasValidRegistrationToken ? (
                <p className="m-0 rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">
                  Ogiltig registreringslänk. Be en administratör om en ny länk.
                </p>
              ) : null}
              <label className="field-label">
                För och efternamn
                <input
                  name="full_name"
                  value={registerForm.full_name}
                  onChange={(event) => setRegisterForm((previous) => ({ ...previous, full_name: event.target.value }))}
                  disabled={!hasValidRegistrationToken}
                  minLength={3}
                />
              </label>
              <label className="field-label">
                Telefonnummer (för enklare Swish'ar)
                <input
                  name="phone"
                  type="tel"
                  value={registerForm.phone}
                  onChange={(event) => setRegisterForm((previous) => ({ ...previous, phone: event.target.value }))}
                  disabled={!hasValidRegistrationToken}
                  placeholder="T.ex. +46-70-123 45 67"
                  autoComplete="tel"
                />
              </label>
              <div className="space-y-4">
                <PasskeyButton
                  label="Skapa konto med Passkey"
                  loadingLabel="Startar Passkey..."
                  loading={passkeyLoading}
                  disabled={isBusy || !hasValidRegistrationToken || !hasValidRegisterName}
                  onClick={onPasskeySignup}
                />
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <PasskeyButton
                label="Logga in med Passkey"
                loadingLabel="Startar Passkey..."
                loading={passkeyLoading}
                disabled={isBusy}
                onClick={handlePasskeyLogin}
              />
            </div>
          )}

          {!isRegisterMode && devboxAvailable ? (
            <div className="space-y-3">
              <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Devbox</p>
              <div className="space-y-2">
                {devboxUsers.length ? devboxUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className="btn-secondary w-full items-start justify-start py-3 text-left"
                    onClick={() => handleDevboxUserLogin(user.id)}
                    disabled={isBusy}
                  >
                    <span className="flex w-full flex-col items-start gap-0.5 leading-tight">
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

          <p className="m-0 text-sm text-[var(--text-secondary)]">
            {!isRegisterMode ? (
              hasRegistrationToken ? (
                <>
                  Har du inget konto? <Link to={`/register?${encodeURIComponent(registrationToken)}`}>Registrera dig</Link>
                </>
              ) : 'Registrering kräver en inbjudningslänk från admin.'
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
