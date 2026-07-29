import { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { ChevronDown, FolderPlus, LogOut, Settings, UserCircle2 } from 'lucide-react';
import { parseUser } from '../lib/session.js';
import { getUserDisplayName } from '../lib/users.js';
import { post, put } from '../api/client.js';
import { GROUP_THEMES } from '../lib/groupTheme.js';

export default function AppShell() {
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupTheme, setNewGroupTheme] = useState(GROUP_THEMES[0].id);
  const [groupError, setGroupError] = useState('');
  const [groupSaving, setGroupSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: '', email: '', initials: '', current_password: '', new_password: '' });
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [user, setUser] = useState(() => parseUser());
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const openEditProfile = () => {
    setProfileForm({ full_name: user?.full_name || '', email: user?.email || '', initials: user?.initials || '', current_password: '', new_password: '' });
    setProfileError('');
    setDropdownOpen(false);
    setEditingProfile(true);
  };

  const openCreateGroup = () => {
    setNewGroupName('');
    setNewGroupTheme(GROUP_THEMES[0].id);
    setGroupError('');
    setCreatingGroup(true);
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setProfileError('');
    setProfileSaving(true);
    try {
      const trimmedInitials = profileForm.initials.trim();
      const body = { full_name: profileForm.full_name, email: profileForm.email, initials: trimmedInitials.length === 2 ? trimmedInitials : '' };
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

  const handleCreateGroup = async (event) => {
    event.preventDefault();
    setGroupError('');
    setGroupSaving(true);
    try {
      const group = await post('/api/groups', { name: newGroupName, theme_color: newGroupTheme });
      setCreatingGroup(false);
      navigate(`/groups/${group.id}`);
    } catch (err) {
      setGroupError(err.message || 'Något gick fel.');
    } finally {
      setGroupSaving(false);
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
              <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-[var(--app-surface-muted)]">
                <img src="/app-icon.png" alt="Kvitt ikon" className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="m-0 text-sm font-semibold">Kvitt</p>
                <p className="m-0 text-xs text-[var(--text-muted)]">#teambail on tour</p>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="hidden min-h-11 items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--app-surface-muted)] hover:text-[var(--text-primary)] md:inline-flex"
              onClick={openCreateGroup}
            >
              <FolderPlus className="h-4 w-4" />
              Skapa grupp
            </button>

            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-3 text-left"
                onClick={() => setDropdownOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={dropdownOpen}
              >
                <UserCircle2 className="h-5 w-5 text-[var(--text-secondary)] md:h-5 md:w-5" />
                <span className="text-sm font-medium md:hidden">Profil</span>
                <div className="hidden leading-tight md:block">
                  <p className="m-0 text-sm font-medium">{user ? getUserDisplayName(user) : 'Konto'}</p>
                  <p className="m-0 text-xs text-[var(--text-muted)]">{user?.email || ''}</p>
                </div>
                <ChevronDown className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen ? (
                <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] py-1 shadow-[var(--shadow-strong)]">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]"
                    onClick={openEditProfile}
                  >
                    <UserCircle2 className="h-4 w-4 text-[var(--text-secondary)]" />
                    Redigera profil
                  </button>
                  {user?.is_admin ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]"
                      onClick={() => { setDropdownOpen(false); navigate('/admin'); }}
                    >
                      <Settings className="h-4 w-4 text-[var(--text-secondary)]" />
                      Adminpanel
                    </button>
                  ) : null}
                  <div className="my-1 border-t border-[var(--border-subtle)]" />
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--danger)] hover:bg-[color:color-mix(in_srgb,var(--danger)_6%,transparent)]"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" />
                    Logga ut
                  </button>
                </div>
              ) : null}
            </div>
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

      {creatingGroup ? (
        <div className="modal-backdrop" onClick={() => setCreatingGroup(false)}>
          <div className="modal-sheet md:w-[420px]" onClick={(event) => event.stopPropagation()}>
            <form className="space-y-5 p-5 sm:p-6" onSubmit={handleCreateGroup}>
              <div className="space-y-1">
                <p className="section-eyebrow">Grupper</p>
                <h2 className="m-0 text-xl font-semibold">Skapa ny grupp</h2>
              </div>
              <div className="space-y-3">
                <label className="field-label">
                  Gruppnamn
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="T.ex. Sommarstugan, Matlagskassan…"
                    required
                    autoFocus
                  />
                </label>
                <div className="grid gap-1.5">
                  <p className="text-sm font-medium text-[var(--text-secondary)]">Färgtema</p>
                  <div className="flex flex-wrap gap-2">
                    {GROUP_THEMES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        title={t.name}
                        onClick={() => setNewGroupTheme(t.id)}
                        className="h-7 w-7 rounded-full transition hover:scale-110 focus:outline-none"
                        style={{
                          background: t.base,
                          boxShadow: newGroupTheme === t.id ? `0 0 0 2px white, 0 0 0 4px ${t.base}` : undefined,
                        }}
                        aria-pressed={newGroupTheme === t.id}
                        aria-label={t.name}
                      />
                    ))}
                  </div>
                </div>
                {groupError ? (
                  <p className="m-0 rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{groupError}</p>
                ) : null}
              </div>
              <div className="flex gap-3">
                <button type="button" className="btn-secondary flex-1" onClick={() => setCreatingGroup(false)}>
                  Avbryt
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={groupSaving}>
                  {groupSaving ? 'Skapar…' : 'Skapa grupp'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editingProfile ? (
        <div className="modal-backdrop" onClick={() => setEditingProfile(false)}>
          <div className="modal-sheet md:w-[420px]" onClick={(event) => event.stopPropagation()}>
            <form className="space-y-5 p-5 sm:p-6" onSubmit={handleSaveProfile}>
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
                  <span>Initialer <span className="text-[var(--text-muted)] font-normal">(valfritt, exakt 2 tecken)</span></span>
                  <input
                    type="text"
                    value={profileForm.initials}
                    onChange={(e) => setProfileForm((f) => ({ ...f, initials: e.target.value.slice(0, 2) }))}
                    placeholder="Lämna tomt för automatiska initialer"
                    autoComplete="off"
                    maxLength={2}
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
                  <span>Nytt lösenord <span className="text-[var(--text-muted)] font-normal">(valfritt)</span></span>
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
