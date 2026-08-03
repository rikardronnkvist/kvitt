import { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Bell, BellOff, FolderPlus, Home, Info, KeyRound, LogOut, Menu, ScanLine, Settings, UserCircle2, X } from 'lucide-react';
import { parseUser } from '../lib/session.js';
import { get, post, put } from '../api/client.js';
import { GROUP_THEMES } from '../lib/groupTheme.js';
import InviteQrScannerModal from './InviteQrScannerModal.jsx';
import {
  addPasskeyToAccount,
  deleteMyPasskey,
  getPasskeyErrorMessage,
  listMyPasskeys,
  renameMyPasskey,
} from '../auth/passkey.js';
import { formatDateTime } from '../lib/format.js';
import { formatSwedishPhone, sanitizePhoneInput } from '../lib/phone.js';
import { isPushSupported, isIosNonStandalone, subscribeToPush, unsubscribeFromPush, getSubscriptionState } from '../lib/pushNotifications.js';

export default function AppShell() {
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [managingPasskeys, setManagingPasskeys] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupTheme, setNewGroupTheme] = useState(GROUP_THEMES[0].id);
  const [groupError, setGroupError] = useState('');
  const [groupSaving, setGroupSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '', initials: '' });
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [passkeys, setPasskeys] = useState([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [passkeysSaving, setPasskeysSaving] = useState(false);
  const [passkeysActionId, setPasskeysActionId] = useState(null);
  const [passkeysError, setPasskeysError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [user, setUser] = useState(() => parseUser());
  const dropdownRef = useRef(null);
  const [notifState, setNotifState] = useState('loading'); // loading | unsupported | default | subscribed | denied | dismissed

  // JWT no longer carries profile fields; fetch them from the API on mount
  useEffect(() => {
    get('/api/auth/me').then(({ user: profile }) => {
      setUser((prev) => ({ ...prev, ...profile }));
    }).catch(() => {});
  }, []);

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

  const handleInviteDetected = (inviteToken) => {
    setScannerOpen(false);
    navigate(`/invite/${inviteToken}`);
  };

  useEffect(() => {
    if (!isPushSupported()) { setNotifState('unsupported'); return; }
    if (isIosNonStandalone()) { setNotifState('ios_install'); return; }
    if (localStorage.getItem('notifications_dismissed')) { setNotifState('dismissed'); return; }
    getSubscriptionState().then(setNotifState);
  }, []);

  const handleEnableNotifications = async () => {
    try {
      await subscribeToPush();
      setNotifState('subscribed');
    } catch (err) {
      if (err.message === 'permission_denied') setNotifState('denied');
      else if (err.message === 'ios_install') setNotifState('ios_install');
      else { console.error('[push]', err); setNotifState('dismissed'); }
    }
  };

  const handleDismissNotifications = () => {
    localStorage.setItem('notifications_dismissed', '1');
    setNotifState('dismissed');
  };

  const openEditProfile = () => {
    setProfileForm({ full_name: user?.full_name || '', phone: formatSwedishPhone(user?.phone || ''), initials: user?.initials || '' });
    setProfileError('');
    setDropdownOpen(false);
    setEditingProfile(true);
  };

  const openCreateGroup = async () => {
    setNewGroupName('');
    setGroupError('');
    // Pick a random color not already in use; fall back to all if all are taken
    let usedColors = [];
    try {
      const groups = await get('/api/groups');
      usedColors = groups.map((g) => g.theme_color).filter(Boolean);
    } catch {
      // ignore — fall back to full pool
    }
    const pool = GROUP_THEMES.filter((t) => !usedColors.includes(t.id));
    const source = pool.length > 0 ? pool : GROUP_THEMES;
    setNewGroupTheme(source[Math.floor(Math.random() * source.length)].id);
    setCreatingGroup(true);
  };

  const refreshPasskeys = async () => {
    const data = await listMyPasskeys();
    setPasskeys(data);
  };

  const openPasskeys = async () => {
    setDropdownOpen(false);
    setPasskeysError('');
    setPasskeysLoading(true);
    setManagingPasskeys(true);
    try {
      await refreshPasskeys();
    } catch (err) {
      setPasskeysError(err.message || 'Kunde inte ladda passkeys.');
      setPasskeys([]);
    } finally {
      setPasskeysLoading(false);
    }
  };

  const handleAddPasskey = async () => {
    setPasskeysError('');
    setPasskeysSaving(true);
    try {
      const data = await addPasskeyToAccount();
      localStorage.setItem('token', data.token);
      const { user: profile } = await get('/api/auth/me');
      setUser((prev) => ({ ...prev, ...profile }));
      await refreshPasskeys();
    } catch (err) {
      setPasskeysError(getPasskeyErrorMessage(err, 'register'));
    } finally {
      setPasskeysSaving(false);
    }
  };

  const handleRenamePasskey = async (passkeyId, name) => {
    setPasskeysError('');
    setPasskeysActionId(passkeyId);
    try {
      await renameMyPasskey(passkeyId, name.trim());
      await refreshPasskeys();
    } catch (err) {
      setPasskeysError(err.message || 'Kunde inte byta namn på passkey.');
    } finally {
      setPasskeysActionId(null);
    }
  };

  const handleDeletePasskey = async (passkeyId) => {
    if (!window.confirm('Är du säker på att du vill ta bort den här passkeyn?')) {
      return;
    }
    setPasskeysError('');
    setPasskeysActionId(passkeyId);
    try {
      await deleteMyPasskey(passkeyId);
      await refreshPasskeys();
    } catch (err) {
      setPasskeysError(err.message || 'Kunde inte ta bort passkey.');
    } finally {
      setPasskeysActionId(null);
    }
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setProfileError('');
    setProfileSaving(true);
    try {
      const trimmedInitials = profileForm.initials.trim();
      const body = {
        full_name: profileForm.full_name,
        phone: formatSwedishPhone(profileForm.phone),
        initials: trimmedInitials.length === 2 ? trimmedInitials : '',
      };
      const data = await put('/api/auth/profile', body);
      localStorage.setItem('token', data.token);
      setUser((prev) => ({ ...prev, ...data.user }));
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
      navigate(`/groups/${group.slug || group.id}`);
    } catch (err) {
      setGroupError(err.message || 'Något gick fel.');
    } finally {
      setGroupSaving(false);
    }
  };

  const hasNotificationsMenuItem = notifState === 'subscribed' || notifState === 'default' || notifState === 'dismissed';

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[color:var(--app-surface)/88%] backdrop-blur-xl">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <div className="mx-auto flex h-16 max-w-[960px] items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.location.assign('/')}
                className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-3 py-2 text-left shadow-[var(--shadow-soft)]"
              >
                <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-[var(--app-surface-muted)]">
                  <img src="/app-icon.png" alt="Kvitt ikon" className="h-full w-full object-cover" />
                </div>
                <div>
                  <p className="m-0 text-sm font-semibold">Kvitt</p>
                  <p className="m-0 text-xs text-[var(--text-muted)]">{window.__kvittConfig?.tagline || import.meta.env.VITE_TAGLINE || 'Dela kostnader, bli kvitt'}</p>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-3 text-left"
                  onClick={() => setDropdownOpen((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={dropdownOpen}
                  aria-label="Öppna meny"
                >
                  <Menu className="h-5 w-5" />
                </button>

                {dropdownOpen ? (
                  <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] py-1 shadow-[var(--shadow-strong)]">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]"
                    onClick={() => { setDropdownOpen(false); window.location.assign('/'); }}
                  >
                    <Home className="h-4 w-4 text-[var(--text-secondary)]" />
                    Mina grupper
                  </button>
                  {user ? (
                    <>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]"
                        onClick={() => { setDropdownOpen(false); openCreateGroup(); }}
                      >
                        <FolderPlus className="h-4 w-4 text-[var(--text-secondary)]" />
                        Skapa grupp
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 whitespace-nowrap px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)] md:hidden"
                        onClick={() => { setDropdownOpen(false); setScannerOpen(true); }}
                      >
                        <ScanLine className="h-4 w-4 text-[var(--text-secondary)]" />
                        Skanna QR-kod
                      </button>
                      <div className="my-1 border-t border-[var(--border-subtle)]" />
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]"
                    onClick={openEditProfile}
                  >
                    <UserCircle2 className="h-4 w-4 text-[var(--text-secondary)]" />
                    Redigera profil
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]"
                    onClick={openPasskeys}
                  >
                    <KeyRound className="h-4 w-4 text-[var(--text-secondary)]" />
                    Mina Passkeys
                  </button>
                  {!user?.is_admin || hasNotificationsMenuItem ? (
                    <div className="my-1 border-t border-[var(--border-subtle)]" />
                  ) : null}
                  {notifState === 'subscribed' ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]"
                      onClick={async () => { await unsubscribeFromPush(); setNotifState('default'); setDropdownOpen(false); }}
                    >
                      <BellOff className="h-4 w-4 text-[var(--text-secondary)]" />
                      Stäng av notiser
                    </button>
                  ) : notifState === 'default' || notifState === 'dismissed' ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]"
                      onClick={() => { localStorage.removeItem('notifications_dismissed'); setNotifState('default'); setDropdownOpen(false); }}
                    >
                      <Bell className="h-4 w-4 text-[var(--text-secondary)]" />
                      Aktivera notiser
                    </button>
                  ) : null}
                  {user?.is_admin ? <div className="my-1 border-t border-[var(--border-subtle)]" /> : null}
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
                  {user?.is_admin ? <div className="my-1 border-t border-[var(--border-subtle)]" /> : null}
                  <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]"
                      onClick={() => { setDropdownOpen(false); navigate('/about'); }}
                    >
                      <Info className="h-4 w-4 text-[var(--text-secondary)]" />
                      Om Kvitt
                    </button>
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
        </div>
      </header>

      <div className="mx-auto max-w-[1280px] px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-[960px]">
            {notifState === 'default' ? (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-4 py-3 shadow-[var(--shadow-soft)]">
                <div className="flex items-center gap-3">
                  <Bell className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                  <p className="m-0 text-sm text-[var(--text-secondary)]">Aktivera notiser för att få ett meddelande när någon lägger till en utgift.</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" className="btn-primary py-1.5 text-xs" onClick={handleEnableNotifications}>
                    Aktivera
                  </button>
                  <button type="button" className="icon-button" aria-label="Stäng" onClick={handleDismissNotifications}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : notifState === 'ios_install' ? (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-4 py-3 shadow-[var(--shadow-soft)]">
                <div className="flex items-center gap-3">
                  <Bell className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                  <p className="m-0 text-sm text-[var(--text-secondary)]">Lägg till Kvitt på hemskärmen för att aktivera notiser i Safari.</p>
                </div>
                <button type="button" className="icon-button shrink-0" aria-label="Stäng" onClick={handleDismissNotifications}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            <Outlet />
          </div>
        </div>
      </div>

      {creatingGroup ? (
        <div className="modal-backdrop app-shell-modal-backdrop" onClick={() => setCreatingGroup(false)}>
          <div className="modal-sheet app-shell-modal-sheet md:w-[420px]" onClick={(event) => event.stopPropagation()}>
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
                    placeholder="T.ex. Nissedal 2026, Rjukan Feb 26 ..."
                    required
                    autoFocus
                  />
                </label>
                <div className="grid gap-3">
                  <p className="text-sm font-medium text-[var(--text-secondary)]">Färgtema</p>
                  <div className="flex gap-2 overflow-x-auto px-2 py-2">
                    {GROUP_THEMES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        title={t.name}
                        onClick={() => setNewGroupTheme(t.id)}
                        className="h-7 w-7 rounded-full transition hover:scale-110 focus:outline-none focus-visible:ring-2"
                        style={{
                          background: t.base,
                          outline: newGroupTheme === t.id ? `2px solid ${t.base}` : undefined,
                          outlineOffset: newGroupTheme === t.id ? '2px' : undefined,
                          boxShadow: newGroupTheme === t.id
                            ? `0 0 0 3px var(--app-surface-strong), 0 0 0 5px ${t.base}`
                            : undefined,
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
        <div className="modal-backdrop app-shell-modal-backdrop" onClick={() => setEditingProfile(false)}>
          <div className="modal-sheet app-shell-modal-sheet md:w-[420px]" onClick={(event) => event.stopPropagation()}>
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
                  Telefonnummer (för enklare Swish'ar)
                  <input
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm((f) => ({ ...f, phone: sanitizePhoneInput(e.target.value) }))}
                    onBlur={(e) => setProfileForm((f) => ({ ...f, phone: formatSwedishPhone(e.target.value) }))}
                    placeholder="T.ex. +46-70-123 45 67"
                    autoComplete="tel"
                    pattern="[\d+\-\s]*"
                  />
                </label>
                <label className="field-label">
                  <span>Initialer <span className="text-[var(--text-muted)] font-normal">(valfritt, 2 tecken)</span></span>
                  <input
                    type="text"
                    value={profileForm.initials}
                    onChange={(e) => setProfileForm((f) => ({ ...f, initials: e.target.value.slice(0, 2) }))}
                    placeholder="Lämna tomt för automatiska initialer"
                    autoComplete="off"
                    maxLength={2}
                  />
                </label>
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

      {managingPasskeys ? (
        <div className="modal-backdrop app-shell-modal-backdrop" onClick={() => setManagingPasskeys(false)}>
          <div className="modal-sheet app-shell-modal-sheet md:w-[480px]" onClick={(event) => event.stopPropagation()}>
            <div className="space-y-5 p-5 sm:p-6">
              <div className="space-y-1">
                <p className="section-eyebrow">Säkerhet</p>
                <h2 className="m-0 text-xl font-semibold">Mina Passkeys</h2>
              </div>

              {passkeysLoading ? (
                <p className="m-0 text-sm text-[var(--text-secondary)]">Laddar passkeys...</p>
              ) : passkeys.length ? (
                <div className="space-y-2">
                  {passkeys.map((passkey) => (
                    <div key={passkey.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] px-3 py-2.5">
                      <input
                        type="text"
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-2 py-1 text-sm font-semibold"
                        value={passkey.name || ''}
                        onChange={(event) => setPasskeys((previous) => previous.map((row) => (row.id === passkey.id ? { ...row, name: event.target.value } : row)))}
                      />
                      <p className="m-0 text-xs text-[var(--text-secondary)]">
                        Skapad: {formatDateTime(passkey.created_at)}
                      </p>
                      <p className="m-0 text-xs text-[var(--text-secondary)]">
                        Senast använd: {passkey.last_used_at ? formatDateTime(passkey.last_used_at) : 'Aldrig'}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className="btn-secondary flex-1"
                          onClick={() => handleRenamePasskey(passkey.id, passkey.name || '')}
                          disabled={passkeysLoading || passkeysSaving || passkeysActionId === passkey.id || !(passkey.name || '').trim()}
                        >
                          {passkeysActionId === passkey.id ? 'Sparar...' : 'Spara namn'}
                        </button>
                        <button
                          type="button"
                          className="btn-danger flex-1"
                          onClick={() => handleDeletePasskey(passkey.id)}
                          disabled={passkeysLoading || passkeysSaving || passkeysActionId === passkey.id || Number(user?.current_passkey_id) === Number(passkey.id)}
                          title={Number(user?.current_passkey_id) === Number(passkey.id) ? 'Kan inte ta bort passkeyn för aktuell session.' : undefined}
                        >
                          Ta bort
                        </button>
                      </div>
                      {Number(user?.current_passkey_id) === Number(passkey.id) ? (
                        <p className="mt-1 m-0 text-xs text-[var(--text-secondary)]">Aktiv i denna session och kan inte tas bort.</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="m-0 text-sm text-[var(--text-secondary)]">Inga passkeys registrerade ännu.</p>
              )}

              {passkeysError ? (
                <p className="m-0 rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{passkeysError}</p>
              ) : null}

              <div className="flex gap-3">
                <button type="button" className="btn-secondary flex-1" onClick={() => setManagingPasskeys(false)}>
                  Stäng
                </button>
                <button type="button" className="btn-primary flex-1" onClick={handleAddPasskey} disabled={passkeysLoading || passkeysSaving}>
                  {passkeysSaving ? 'Startar...' : 'Lägg till Passkey'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {scannerOpen ? (
        <InviteQrScannerModal
          onClose={() => setScannerOpen(false)}
          onDetected={handleInviteDetected}
        />
      ) : null}
    </div>
  );
}
