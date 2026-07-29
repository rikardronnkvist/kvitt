import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { post } from '../api/client.js';

const loginInitialState = { identifier: '', password: '' };
const registerInitialState = { username: '', email: '', password: '' };

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
    <main className="auth-page">
      <section className="card auth-card">
        <div className="auth-switcher">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Logga in
          </button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Registrera dig
          </button>
        </div>

        <form onSubmit={handleSubmit} className="form-grid">
          {mode === 'register' ? (
            <label>
              Användarnamn
              <input name="username" value={registerForm.username} onChange={handleChange(setRegisterForm)} required />
            </label>
          ) : null}

          <label>
            {mode === 'login' ? 'Användarnamn eller e-post' : 'E-post'}
            <input
              name={mode === 'login' ? 'identifier' : 'email'}
              type={mode === 'login' ? 'text' : 'email'}
              value={mode === 'login' ? loginForm.identifier : registerForm.email}
              onChange={mode === 'login' ? handleChange(setLoginForm) : handleChange(setRegisterForm)}
              required
            />
          </label>

          <label>
            Lösenord
            <input name="password" type="password" value={mode === 'login' ? loginForm.password : registerForm.password} onChange={mode === 'login' ? handleChange(setLoginForm) : handleChange(setRegisterForm)} required />
          </label>

          {error ? <p className="error-text">{error}</p> : null}
          <button type="submit" disabled={loading}>{loading ? 'Sparar...' : mode === 'login' ? 'Logga in' : 'Registrera'}</button>
        </form>

        <p>
          {mode === 'login' ? (
            <>Har du inget konto? <Link to="/register">Registrera dig</Link></>
          ) : (
            <>Har du redan ett konto? <Link to="/login">Logga in</Link></>
          )}
        </p>
      </section>
    </main>
  );
}
