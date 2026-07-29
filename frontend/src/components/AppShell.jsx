import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FolderKanban, LayoutGrid, LogOut, PlusCircle, Settings, UserCircle2 } from 'lucide-react';
import { parseUser } from '../lib/session.js';
import { getUserDisplayName } from '../lib/users.js';
import { put } from '../api/client.js';

export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [accountOpen, setAccountOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: '', email: '', current_password: '', new_password: '' });
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [user, setUser] = useState(() => parseUser());
  const routeGroupId = location.pathname.match(/^\/groups\/(\d+)/)?.[1] ?? null;
  const [lastGroupId, setLastGroupId] = useState(() => localStorage.getItem('last-group-id'));

  useEffect(() => {
    if (!routeGroupId) return;
    localStorage.setItem('last-group-id', routeGroupId);
    setLastGroupId(routeGroupId);
  }, [routeGroupId]);

  const currentGroupId = routeGroupId || lastGroupId;
  const addExpenseHref = currentGroupId ? `/groups/${currentGroupId}/expenses/new` : '/';
  const isAddExpenseActive = location.pathname === addExpenseHref;

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('last-group-id');
    navigate('/login');
  };

  const openEditProfile = () => {
    setProfileForm({ full_name: user?.full_name || '', email: user?.email || '', current_password: '', new_password: '' });
    setProfileError('');
    setEditingProfile(true);
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setProfileError('');
    setProfileSaving(true);
    try {
      const body = { full_name: profileForm.full_name, email: profileForm.email };
      if (profileForm.new_password) {
        body.current_password = profileForm.current_password;
        body.new_password = profileForm.new_password;
      }
      const data = await put('/api/auth/profile', body);
      localStorage.setItem('token', data.token);
      setUser(parseUser());
      setEditingProfile(false);
    } catch (err) {
      setProfileError(err.message || 'Något gick fel.');
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[color:var(--app-surface)/88%] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-3 py-2 text-left shadow-[var(--shadow-soft)]"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--app-surface-muted)]">
                <span className="text-sm font-semibold text-[var(--text-primary)]">K</span>
              </div>
              <div>
                <p className="m-0 text-sm font-semibold">Kvitt</p>
                <p className="m-0 text-xs text-[var(--text-muted)]">Smartare delade utgifter</p>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {user?.is_admin ? (
              <NavLink
                to="/admin"
                className="hidden min-h-11 items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--app-surface-muted)] hover:text-[var(--text-primary)] md:inline-flex"
              >
                <Settings className="h-4 w-4" />
                Admin
              </NavLink>
            ) : null}
            <button
              type="button"
              className="hidden min-h-11 items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-3 text-left md:inline-flex"
              onClick={() => setAccountOpen((previous) => !previous)}
            >
              <UserCircle2 className="h-5 w-5 text-[var(--text-secondary)]" />
              <div className="leading-tight">
                <p className="m-0 text-sm font-medium">{user ? getUserDisplayName(user) : 'Konto'}</p>
                <p className="m-0 text-xs text-[var(--text-muted)]">{user?.email || 'Ingen e-post tillgänglig'}</p>
              </div>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1280px] px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-[960px]">
            <Outlet />
          </div>
        </div>
      </div>

      <nav className="mobile-bottom-nav lg:hidden" aria-label="Primär navigering">
        <div className="mobile-bottom-nav-grid">
          <NavLink to="/" className={({ isActive }) => `mobile-bottom-nav-item ${isActive ? 'active' : ''}`}>
            <LayoutGrid className="h-4 w-4" />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/" className={({ isActive }) => `mobile-bottom-nav-item ${isActive ? 'active' : ''}`}>
            <FolderKanban className="h-4 w-4" />
            <span>Groups</span>
          </NavLink>
          <NavLink to={addExpenseHref} className={`mobile-bottom-nav-item ${isAddExpenseActive ? 'active' : ''}`}>
            <PlusCircle className="h-4 w-4" />
            <span>Add Expense</span>
          </NavLink>
          <button type="button" className="mobile-bottom-nav-item" onClick={() => setAccountOpen(true)}>
            <UserCircle2 className="h-4 w-4" />
            <span>Profile</span>
          </button>
        </div>
      </nav>

      {accountOpen ? (
        <div className="modal-backdrop" onClick={() => { setAccountOpen(false); setEditingProfile(false); }}>
          <div className="modal-sheet md:w-[420px]" onClick={(event) => event.stopPropagation()}>
            {editingProfile ? (
              <form className="space-y-5" onSubmit={handleSaveProfile}>
                <div className="space-y-1">
                  <p className="section-eyebrow">Profil</p>
                  <h2 className="m-0 text-xl font-semibold">Redigera profil</h2>
                </div>
                <div className="space-y-3">
                  <label className="field-label">
                    Fullständigt namn
                    <input
                      type="text"
                      value={profileForm.full_name}
                      onChange={(e) => setProfileForm((f) => ({ ...f, full_name: e.target.value }))}
                      required
                      autoComplete="name"
                    />
                  </label>
                  <label className="field-label">
                    E-post
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                      required
                      autoComplete="email"
                    />
                  </label>
                  <label className="field-label">
                    Nytt lösenord <span className="text-[var(--text-muted)] font-normal">(valfritt)</span>
                    <input
                      type="password"
                      value={profileForm.new_password}
                      onChange={(e) => setProfileForm((f) => ({ ...f, new_password: e.target.value }))}
                      autoComplete="new-password"
                      placeholder="Lämna tomt för att behålla"
                    />
                  </label>
                  {profileForm.new_password ? (
                    <label className="field-label">
                      Nuvarande lösenord
                      <input
                        type="password"
                        value={profileForm.current_password}
                        onChange={(e) => setProfileForm((f) => ({ ...f, current_password: e.target.value }))}
                        autoComplete="current-password"
                        required
                      />
                    </label>
                  ) : null}
                  {profileError ? (
                    <p className="m-0 rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{profileError}</p>
                  ) : null}
                </div>
                <div className="flex gap-3">
                  <button type="button" className="btn-secondary flex-1" onClick={() => setEditingProfile(false)}>
                    Avbryt
                  </button>
                  <button type="submit" className="btn-primary flex-1" disabled={profileSaving}>
                    {profileSaving ? 'Sparar…' : 'Spara'}
                  </button>
                </div>
              </form>
            ) : (
              <section className="space-y-5">
                <div className="space-y-1">
                  <p className="section-eyebrow">Profil</p>
                  <h2 className="m-0 text-xl font-semibold">{user ? getUserDisplayName(user) : 'Konto'}</h2>
                  <p className="m-0 text-sm text-[var(--text-secondary)]">{user?.email || 'Ingen e-post tillgänglig'}</p>
                </div>
                <div className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4">
                  <button type="button" className="btn-secondary w-full justify-start" onClick={openEditProfile}>
                    <UserCircle2 className="h-4 w-4" />
                    Redigera profil
                  </button>
                  {user?.is_admin ? (
                    <button type="button" className="btn-secondary w-full justify-start" onClick={() => { setAccountOpen(false); navigate('/admin'); }}>
                      <Settings className="h-4 w-4" />
                      Adminpanel
                    </button>
                  ) : null}
                </div>
                <div className="flex gap-3">
                  <button type="button" className="btn-secondary flex-1" onClick={() => setAccountOpen(false)}>
                    Stäng
                  </button>
                  <button type="button" className="btn-primary flex-1" onClick={handleLogout}>
                    <LogOut className="h-4 w-4" />
                    Logga ut
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}


export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState(getInitialTheme);
  const [accountOpen, setAccountOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: '', email: '', current_password: '', new_password: '' });
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [user, setUser] = useState(() => parseUser());
  const routeGroupId = location.pathname.match(/^\/groups\/(\d+)/)?.[1] ?? null;
  const [lastGroupId, setLastGroupId] = useState(() => localStorage.getItem('last-group-id'));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme-preference', theme);
  }, [theme]);

  useEffect(() => {
    if (!routeGroupId) return;
    localStorage.setItem('last-group-id', routeGroupId);
    setLastGroupId(routeGroupId);
  }, [routeGroupId]);

  const currentGroupId = routeGroupId || lastGroupId;
  const addExpenseHref = currentGroupId ? `/groups/${currentGroupId}/expenses/new` : '/';
  const isAddExpenseActive = location.pathname === addExpenseHref;

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('last-group-id');
    navigate('/login');
  };

  const openEditProfile = () => {
    setProfileForm({ full_name: user?.full_name || '', email: user?.email || '', current_password: '', new_password: '' });
    setProfileError('');
    setEditingProfile(true);
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setProfileError('');
    setProfileSaving(true);
    try {
      const body = { full_name: profileForm.full_name, email: profileForm.email };
      if (profileForm.new_password) {
        body.current_password = profileForm.current_password;
        body.new_password = profileForm.new_password;
      }
      const data = await put('/api/auth/profile', body);
      localStorage.setItem('token', data.token);
      setUser(parseUser());
      setEditingProfile(false);
    } catch (err) {
      setProfileError(err.message || 'Något gick fel.');
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[color:var(--app-surface)/88%] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-3 py-2 text-left shadow-[var(--shadow-soft)]"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--app-surface-muted)]">
                <span className="text-sm font-semibold text-[var(--text-primary)]">K</span>
              </div>
              <div>
                <p className="m-0 text-sm font-semibold">Kvitt</p>
                <p className="m-0 text-xs text-[var(--text-muted)]">Smartare delade utgifter</p>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {user?.is_admin ? (
              <NavLink
                to="/admin"
                className="hidden min-h-11 items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--app-surface-muted)] hover:text-[var(--text-primary)] md:inline-flex"
              >
                <Settings className="h-4 w-4" />
                Admin
              </NavLink>
            ) : null}
            <button
              type="button"
              className="icon-button"
              onClick={() => setTheme((previous) => (previous === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? 'Växla till ljust läge' : 'Växla till mörkt läge'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              className="hidden min-h-11 items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-3 text-left md:inline-flex"
              onClick={() => setAccountOpen((previous) => !previous)}
            >
              <UserCircle2 className="h-5 w-5 text-[var(--text-secondary)]" />
              <div className="leading-tight">
                <p className="m-0 text-sm font-medium">{user ? getUserDisplayName(user) : 'Konto'}</p>
                <p className="m-0 text-xs text-[var(--text-muted)]">{user?.email || 'Ingen e-post tillgänglig'}</p>
              </div>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1280px] px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-[960px]">
            <Outlet />
          </div>
        </div>
      </div>

      <nav className="mobile-bottom-nav lg:hidden" aria-label="Primär navigering">
        <div className="mobile-bottom-nav-grid">
          <NavLink to="/" className={({ isActive }) => `mobile-bottom-nav-item ${isActive ? 'active' : ''}`}>
            <LayoutGrid className="h-4 w-4" />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/" className={({ isActive }) => `mobile-bottom-nav-item ${isActive ? 'active' : ''}`}>
            <FolderKanban className="h-4 w-4" />
            <span>Groups</span>
          </NavLink>
          <NavLink to={addExpenseHref} className={`mobile-bottom-nav-item ${isAddExpenseActive ? 'active' : ''}`}>
            <PlusCircle className="h-4 w-4" />
            <span>Add Expense</span>
          </NavLink>
          <button type="button" className="mobile-bottom-nav-item" onClick={() => setAccountOpen(true)}>
            <UserCircle2 className="h-4 w-4" />
            <span>Profile</span>
          </button>
        </div>
      </nav>

      {accountOpen ? (
        <div className="modal-backdrop" onClick={() => { setAccountOpen(false); setEditingProfile(false); }}>
          <div className="modal-sheet md:w-[420px]" onClick={(event) => event.stopPropagation()}>
            {editingProfile ? (
              <form className="space-y-5" onSubmit={handleSaveProfile}>
                <div className="space-y-1">
                  <p className="section-eyebrow">Profil</p>
                  <h2 className="m-0 text-xl font-semibold">Redigera profil</h2>
                </div>
                <div className="space-y-3">
                  <label className="field-label">
                    Fullständigt namn
                    <input
                      type="text"
                      value={profileForm.full_name}
                      onChange={(e) => setProfileForm((f) => ({ ...f, full_name: e.target.value }))}
                      required
                      autoComplete="name"
                    />
                  </label>
                  <label className="field-label">
                    E-post
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                      required
                      autoComplete="email"
                    />
                  </label>
                  <label className="field-label">
                    Nytt lösenord <span className="text-[var(--text-muted)] font-normal">(valfritt)</span>
                    <input
                      type="password"
                      value={profileForm.new_password}
                      onChange={(e) => setProfileForm((f) => ({ ...f, new_password: e.target.value }))}
                      autoComplete="new-password"
                      placeholder="Lämna tomt för att behålla"
                    />
                  </label>
                  {profileForm.new_password ? (
                    <label className="field-label">
                      Nuvarande lösenord
                      <input
                        type="password"
                        value={profileForm.current_password}
                        onChange={(e) => setProfileForm((f) => ({ ...f, current_password: e.target.value }))}
                        autoComplete="current-password"
                        required
                      />
                    </label>
                  ) : null}
                  {profileError ? (
                    <p className="m-0 rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{profileError}</p>
                  ) : null}
                </div>
                <div className="flex gap-3">
                  <button type="button" className="btn-secondary flex-1" onClick={() => setEditingProfile(false)}>
                    Avbryt
                  </button>
                  <button type="submit" className="btn-primary flex-1" disabled={profileSaving}>
                    {profileSaving ? 'Sparar…' : 'Spara'}
                  </button>
                </div>
              </form>
            ) : (
              <section className="space-y-5">
                <div className="space-y-1">
                  <p className="section-eyebrow">Profil</p>
                  <h2 className="m-0 text-xl font-semibold">{user ? getUserDisplayName(user) : 'Konto'}</h2>
                  <p className="m-0 text-sm text-[var(--text-secondary)]">{user?.email || 'Ingen e-post tillgänglig'}</p>
                </div>
                <div className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4">
                  <button type="button" className="btn-secondary w-full justify-start" onClick={openEditProfile}>
                    <UserCircle2 className="h-4 w-4" />
                    Redigera profil
                  </button>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium">Tema</span>
                    <button type="button" className="btn-secondary" onClick={() => setTheme((previous) => (previous === 'dark' ? 'light' : 'dark'))}>
                      {theme === 'dark' ? 'Mörkt läge' : 'Ljust läge'}
                    </button>
                  </div>
                  {user?.is_admin ? (
                    <button type="button" className="btn-secondary w-full justify-start" onClick={() => { setAccountOpen(false); navigate('/admin'); }}>
                      <Settings className="h-4 w-4" />
                      Adminpanel
                    </button>
                  ) : null}
                </div>
                <div className="flex gap-3">
                  <button type="button" className="btn-secondary flex-1" onClick={() => setAccountOpen(false)}>
                    Stäng
                  </button>
                  <button type="button" className="btn-primary flex-1" onClick={handleLogout}>
                    <LogOut className="h-4 w-4" />
                    Logga ut
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
