import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { post } from '../api/client.js';

const loginInitialState = { email: '', password: '' };
const registerInitialState = { email: '', password: '', full_name: '' };

function AuthModeButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'min-h-11 rounded-lg border px-4 text-sm font-semibold transition',
        active
          ? 'border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)] text-[var(--text-primary)]'
          : 'border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--app-surface-muted)]',
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4 py-12">
      <section className="surface-card w-full max-w-[420px] space-y-8 p-7 sm:p-8">
        <div className="space-y-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--app-surface-muted)]">
            <span className="text-base font-semibold text-[var(--text-primary)]">K</span>
          </div>
          <div className="space-y-2">
            <p className="section-eyebrow">Välkommen</p>
            <h1 className="page-title">Logga in på Kvitt</h1>
            <p className="page-copy">En lugn, tydlig plats för delade utgifter och saldon.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AuthModeButton active={mode === 'login'} onClick={() => setMode('login')}>
              Logga in
            </AuthModeButton>
            <AuthModeButton active={mode === 'register'} onClick={() => setMode('register')}>
              Skapa konto
            </AuthModeButton>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' ? (
            <>
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
              value={mode === 'login' ? loginForm.email : registerForm.email}
              onChange={mode === 'login' ? handleChange(setLoginForm) : handleChange(setRegisterForm)}
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
                value={mode === 'login' ? loginForm.password : registerForm.password}
                onChange={mode === 'login' ? handleChange(setLoginForm) : handleChange(setRegisterForm)}
                required
              />
            </div>
          </label>

          {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Sparar...' : mode === 'login' ? 'Fortsätt' : 'Skapa konto'}
            {!loading ? <ArrowRight className="h-4 w-4" /> : null}
          </button>
        </form>

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
      </section>
    </main>
  );
}
