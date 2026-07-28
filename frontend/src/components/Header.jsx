import { Link, useNavigate } from 'react-router-dom';

function parseUser() {
  const token = localStorage.getItem('token');
  if (!token) return null;

  try {
    const [, payload] = token.split('.');
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export default function Header() {
  const navigate = useNavigate();
  const user = parseUser();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <header className="app-header">
      <div>
        <h1>Kvitt</h1>
        <nav>
          <Link to="/">Hem</Link>
        </nav>
      </div>
      <div className="header-actions">
        <span>{user ? `Inloggad som ${user.username}` : 'Inte inloggad'}</span>
        <button type="button" onClick={handleLogout}>Logga ut</button>
      </div>
    </header>
  );
}
