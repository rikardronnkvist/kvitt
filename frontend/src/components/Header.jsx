import { Link, useNavigate } from 'react-router-dom';
import { parseUser } from '../lib/session.js';

export default function Header() {
  const navigate = useNavigate();
  const user = parseUser();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const handleAdminClick = () => {
    navigate('/admin');
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
        {user?.is_admin ? (
          <button type="button" onClick={handleAdminClick}>Admin</button>
        ) : null}
        <button type="button" onClick={handleLogout}>Logga ut</button>
      </div>
    </header>
  );
}
