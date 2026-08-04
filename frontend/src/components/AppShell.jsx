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
import { t } from '../lib/i18n.js';

function getSecureRandomIndex(length) {
  if (!Number.isInteger(length) || length <= 0) {
    return 0;
  }

  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    return 0;
  }

  const values = new Uint32Array(1);
  cryptoApi.getRandomValues(values);
  return values[0] % length;
}

function NotificationsBanner({ notifState, onEnableNotifications, onDismissNotifications }) {
  if (notifState === 'default') {
    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-4 py-3 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-3">
          <Bell className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
          <p className="m-0 text-sm text-[var(--text-secondary)]">{t('shell.notifPrompt')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className="btn-primary py-1.5 text-xs" onClick={onEnableNotifications}>
            {t('shell.enableNotifications')}
          </button>
          <button type="button" className="icon-button" aria-label={t('common.close')} onClick={onDismissNotifications}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (notifState === 'ios_install') {
    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-4 py-3 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-3">
          <Bell className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
          <p className="m-0 text-sm text-[var(--text-secondary)]">{t('shell.iosInstallPrompt')}</p>
        </div>
        <button type="button" className="icon-button shrink-0" aria-label={t('common.close')} onClick={onDismissNotifications}>
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return null;
}

function NotificationsMenuItem({ notifState, onDisableNotifications, onPrepareEnableNotifications }) {
  if (notifState === 'subscribed') {
    return (
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]"
        onClick={onDisableNotifications}
      >
        <BellOff className="h-4 w-4 text-[var(--text-secondary)]" />
        {t('shell.disableNotifications')}
      </button>
    );
  }

  if (notifState === 'default' || notifState === 'dismissed') {
    return (
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]"
        onClick={onPrepareEnableNotifications}
      >
        <Bell className="h-4 w-4 text-[var(--text-secondary)]" />
        {t('shell.enableNotifications')}
      </button>
    );
  }

  return null;
}

function AppMenuDropdown({
  dropdownOpen,
  user,
  hasNotificationsMenuItem,
  notifState,
  setDropdownOpen,
  setScannerOpen,
  setNotifState,
  navigate,
  onOpenCreateGroup,
  onOpenEditProfile,
  onOpenPasskeys,
  onLogout,
}) {
  if (!dropdownOpen) {
    return null;
  }

  const handleDisableNotifications = async () => {
    await unsubscribeFromPush();
    setNotifState('default');
    setDropdownOpen(false);
  };

  const handlePrepareEnableNotifications = () => {
    localStorage.removeItem('notifications_dismissed');
    setNotifState('default');
    setDropdownOpen(false);
  };

  return (
    <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] py-1 shadow-[var(--shadow-strong)]">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]"
        onClick={() => { setDropdownOpen(false); window.location.assign('/'); }}
      >
        <Home className="h-4 w-4 text-[var(--text-secondary)]" />
        {t('shell.myGroups')}
      </button>
      {user ? (
        <>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]"
            onClick={() => { setDropdownOpen(false); onOpenCreateGroup(); }}
          >
            <FolderPlus className="h-4 w-4 text-[var(--text-secondary)]" />
            {t('shell.createGroup')}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 whitespace-nowrap px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)] md:hidden"
            onClick={() => { setDropdownOpen(false); setScannerOpen(true); }}
          >
            <ScanLine className="h-4 w-4 text-[var(--text-secondary)]" />
            {t('shell.scanQr')}
          </button>
          <div className="my-1 border-t border-[var(--border-subtle)]" />
        </>
      ) : null}
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]"
        onClick={onOpenEditProfile}
      >
        <UserCircle2 className="h-4 w-4 text-[var(--text-secondary)]" />
        {t('shell.editProfile')}
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]"
        onClick={onOpenPasskeys}
      >
        <KeyRound className="h-4 w-4 text-[var(--text-secondary)]" />
        {t('shell.myPasskeys')}
      </button>
      {!user?.is_admin || hasNotificationsMenuItem ? (
        <div className="my-1 border-t border-[var(--border-subtle)]" />
      ) : null}
      <NotificationsMenuItem
        notifState={notifState}
        onDisableNotifications={handleDisableNotifications}
        onPrepareEnableNotifications={handlePrepareEnableNotifications}
      />
      {user?.is_admin ? <div className="my-1 border-t border-[var(--border-subtle)]" /> : null}
      {user?.is_admin ? (
        <button
          type="button"
          className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]"
          onClick={() => { setDropdownOpen(false); navigate('/admin'); }}
        >
          <Settings className="h-4 w-4 text-[var(--text-secondary)]" />
          {t('shell.adminPanel')}
        </button>
      ) : null}
      {user?.is_admin ? <div className="my-1 border-t border-[var(--border-subtle)]" /> : null}
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]"
        onClick={() => { setDropdownOpen(false); navigate('/about'); }}
      >
        <Info className="h-4 w-4 text-[var(--text-secondary)]" />
        {t('shell.aboutKvitt')}
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-[var(--danger)] hover:bg-[color:color-mix(in_srgb,var(--danger)_6%,transparent)]"
        onClick={onLogout}
      >
        <LogOut className="h-4 w-4" />
        {t('shell.logout')}
      </button>
    </div>
  );
}

function CreateGroupModal({
  creatingGroup,
  newGroupName,
  newGroupTheme,
  groupError,
  groupSaving,
  setCreatingGroup,
  setNewGroupName,
  setNewGroupTheme,
  onSubmit,
}) {
  if (!creatingGroup) {
    return null;
  }

  return (
    <div className="modal-backdrop app-shell-modal-backdrop">
      <div className="modal-sheet app-shell-modal-sheet md:w-[420px]">
        <form className="space-y-5 p-5 sm:p-6" onSubmit={onSubmit}>
          <div className="space-y-1">
            <p className="section-eyebrow">{t('shell.groupsEyebrow')}</p>
            <h2 className="m-0 text-xl font-semibold">{t('shell.createGroupTitle')}</h2>
          </div>
          <div className="space-y-3">
            <label className="field-label">
              {t('shell.groupName')}
              <input
                type="text"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder={t('shell.groupNamePlaceholder')}
                required
                autoFocus
              />
            </label>
            <div className="grid gap-3">
              <p className="text-sm font-medium text-[var(--text-secondary)]">{t('shell.theme')}</p>
              <div className="flex gap-2 overflow-x-auto px-2 py-2">
                {GROUP_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    title={theme.name}
                    onClick={() => setNewGroupTheme(theme.id)}
                    className="h-7 w-7 rounded-full transition hover:scale-110 focus:outline-none focus-visible:ring-2"
                    style={{
                      background: theme.base,
                      outline: newGroupTheme === theme.id ? `2px solid ${theme.base}` : undefined,
                      outlineOffset: newGroupTheme === theme.id ? '2px' : undefined,
                      boxShadow: newGroupTheme === theme.id
                        ? `0 0 0 3px var(--app-surface-strong), 0 0 0 5px ${theme.base}`
                        : undefined,
                    }}
                    aria-pressed={newGroupTheme === theme.id}
                    aria-label={theme.name}
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
              {t('shell.cancelCreateGroup')}
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={groupSaving}>
              {groupSaving ? t('shell.creating') : t('shell.saveGroup')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditProfileModal({
  editingProfile,
  profileForm,
  profileError,
  profileSaving,
  setEditingProfile,
  setProfileForm,
  onSubmit,
}) {
  if (!editingProfile) {
    return null;
  }

  return (
    <div className="modal-backdrop app-shell-modal-backdrop">
      <div className="modal-sheet app-shell-modal-sheet md:w-[420px]">
        <form className="space-y-5 p-5 sm:p-6" onSubmit={onSubmit}>
          <div className="space-y-1">
            <p className="section-eyebrow">{t('shell.profileEyebrow')}</p>
            <h2 className="m-0 text-xl font-semibold">{t('shell.profileTitle')}</h2>
          </div>
          <div className="space-y-3">
            <label className="field-label">
              {t('auth.fullName')}
              <input
                type="text"
                value={profileForm.full_name}
                onChange={(event) => setProfileForm((formState) => ({ ...formState, full_name: event.target.value }))}
                required
                autoComplete="name"
              />
            </label>
            <label className="field-label">
              {t('auth.phoneLabel')}
              <input
                type="tel"
                value={profileForm.phone}
                onChange={(event) => setProfileForm((formState) => ({ ...formState, phone: sanitizePhoneInput(event.target.value) }))}
                onBlur={(event) => setProfileForm((formState) => ({ ...formState, phone: formatSwedishPhone(event.target.value) }))}
                placeholder={t('auth.phonePlaceholder')}
                autoComplete="tel"
                pattern="[\\d+\-\\s]*"
              />
            </label>
            <label className="field-label">
              <span>{t('shell.initials')} <span className="text-[var(--text-muted)] font-normal">{t('shell.initialsOptionalHint')}</span></span>
              <input
                type="text"
                value={profileForm.initials}
                onChange={(event) => setProfileForm((formState) => ({ ...formState, initials: event.target.value.slice(0, 2) }))}
                placeholder={t('shell.initialsPlaceholder')}
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
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={profileSaving}>
              {profileSaving ? t('shell.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PasskeyRow({
  passkey,
  passkeysLoading,
  passkeysSaving,
  passkeysActionId,
  currentPasskeyId,
  onNameChange,
  onRenamePasskey,
  onDeletePasskey,
}) {
  const isCurrentPasskey = Number(currentPasskeyId) === Number(passkey.id);
  const passkeyName = passkey.name || '';
  const isSavingAction = passkeysActionId === passkey.id;
  const isRenameDisabled = passkeysLoading || passkeysSaving || isSavingAction || !passkeyName.trim();
  const isDeleteDisabled = passkeysLoading || passkeysSaving || isSavingAction || isCurrentPasskey;

  const handleNameChange = (event) => {
    onNameChange(passkey.id, event.target.value);
  };

  const handleRename = () => {
    onRenamePasskey(passkey.id, passkeyName);
  };

  const handleDelete = () => {
    onDeletePasskey(passkey.id);
  };

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] px-3 py-2.5">
      <input
        type="text"
        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-2 py-1 text-sm font-semibold"
        value={passkeyName}
        onChange={handleNameChange}
      />
      <p className="m-0 text-xs text-[var(--text-secondary)]">
        {t('shell.createdAt')}: {formatDateTime(passkey.created_at)}
      </p>
      <p className="m-0 text-xs text-[var(--text-secondary)]">
        {t('shell.lastUsed')}: {passkey.last_used_at ? formatDateTime(passkey.last_used_at) : t('shell.never')}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="btn-secondary flex-1"
          onClick={handleRename}
          disabled={isRenameDisabled}
        >
          {isSavingAction ? t('shell.saving') : t('shell.saveName')}
        </button>
        <button
          type="button"
          className="btn-danger flex-1"
          onClick={handleDelete}
          disabled={isDeleteDisabled}
          title={isCurrentPasskey ? t('shell.cannotDeleteCurrentPasskey') : undefined}
        >
          {t('shell.delete')}
        </button>
      </div>
      {isCurrentPasskey ? (
        <p className="mt-1 m-0 text-xs text-[var(--text-secondary)]">{t('shell.activeSessionPasskey')}</p>
      ) : null}
    </div>
  );
}

function PasskeysContent({
  passkeysLoading,
  passkeys,
  passkeysSaving,
  passkeysActionId,
  currentPasskeyId,
  onNameChange,
  onRenamePasskey,
  onDeletePasskey,
}) {
  if (passkeysLoading) {
    return <p className="m-0 text-sm text-[var(--text-secondary)]">{t('shell.loadingPasskeys')}</p>;
  }

  if (!passkeys.length) {
    return <p className="m-0 text-sm text-[var(--text-secondary)]">{t('shell.noPasskeys')}</p>;
  }

  return (
    <div className="space-y-2">
      {passkeys.map((passkey) => (
        <PasskeyRow
          key={passkey.id}
          passkey={passkey}
          passkeysLoading={passkeysLoading}
          passkeysSaving={passkeysSaving}
          passkeysActionId={passkeysActionId}
          currentPasskeyId={currentPasskeyId}
          onNameChange={onNameChange}
          onRenamePasskey={onRenamePasskey}
          onDeletePasskey={onDeletePasskey}
        />
      ))}
    </div>
  );
}

function PasskeysModal({
  managingPasskeys,
  passkeysLoading,
  passkeys,
  passkeysSaving,
  passkeysActionId,
  passkeysError,
  user,
  setManagingPasskeys,
  setPasskeys,
  onRenamePasskey,
  onDeletePasskey,
  onAddPasskey,
}) {
  if (!managingPasskeys) {
    return null;
  }

  const handlePasskeyNameChange = (passkeyId, name) => {
    setPasskeys((previous) => previous.map((row) => (row.id === passkeyId ? { ...row, name } : row)));
  };

  return (
    <div className="modal-backdrop app-shell-modal-backdrop">
      <div className="modal-sheet app-shell-modal-sheet md:w-[480px]">
        <div className="space-y-5 p-5 sm:p-6">
          <div className="space-y-1">
            <p className="section-eyebrow">{t('shell.securityEyebrow')}</p>
            <h2 className="m-0 text-xl font-semibold">{t('shell.passkeysTitle')}</h2>
          </div>

          <PasskeysContent
            passkeysLoading={passkeysLoading}
            passkeys={passkeys}
            passkeysSaving={passkeysSaving}
            passkeysActionId={passkeysActionId}
            currentPasskeyId={user?.current_passkey_id}
            onNameChange={handlePasskeyNameChange}
            onRenamePasskey={onRenamePasskey}
            onDeletePasskey={onDeletePasskey}
          />

          {passkeysError ? (
            <p className="m-0 rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{passkeysError}</p>
          ) : null}

          <div className="flex gap-3">
            <button type="button" className="btn-secondary flex-1" onClick={() => setManagingPasskeys(false)}>
              {t('common.close')}
            </button>
            <button type="button" className="btn-primary flex-1" onClick={onAddPasskey} disabled={passkeysLoading || passkeysSaving}>
              {passkeysSaving ? t('shell.starting') : t('shell.addPasskey')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
    setNewGroupTheme(source[getSecureRandomIndex(source.length)].id);
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
      setPasskeysError(err.message || t('shell.passkeysLoadFailed'));
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
      setPasskeysError(err.message || t('shell.passkeyRenameFailed'));
    } finally {
      setPasskeysActionId(null);
    }
  };

  const handleDeletePasskey = async (passkeyId) => {
    if (!window.confirm(t('shell.passkeyDeleteConfirm'))) {
      return;
    }
    setPasskeysError('');
    setPasskeysActionId(passkeyId);
    try {
      await deleteMyPasskey(passkeyId);
      await refreshPasskeys();
    } catch (err) {
      setPasskeysError(err.message || t('shell.passkeyDeleteFailed'));
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
      setProfileError(err.message || t('common.somethingWentWrong'));
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
      setGroupError(err.message || t('common.somethingWentWrong'));
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
                  <img src="/app-icon.png" alt={t('shell.appIconAlt')} className="h-full w-full object-cover" />
                </div>
                <div>
                  <p className="m-0 text-sm font-semibold">{t('common.appName')}</p>
                  <p className="m-0 text-xs text-[var(--text-muted)]">{window.__kvittConfig?.tagline || import.meta.env.VITE_TAGLINE || t('common.defaultTagline')}</p>
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
                  aria-label={t('shell.openMenu')}
                >
                  <Menu className="h-5 w-5" />
                </button>
                <AppMenuDropdown
                  dropdownOpen={dropdownOpen}
                  user={user}
                  hasNotificationsMenuItem={hasNotificationsMenuItem}
                  notifState={notifState}
                  setDropdownOpen={setDropdownOpen}
                  setScannerOpen={setScannerOpen}
                  setNotifState={setNotifState}
                  navigate={navigate}
                  onOpenCreateGroup={openCreateGroup}
                  onOpenEditProfile={openEditProfile}
                  onOpenPasskeys={openPasskeys}
                  onLogout={handleLogout}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1280px] px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-[960px]">
            <NotificationsBanner
              notifState={notifState}
              onEnableNotifications={handleEnableNotifications}
              onDismissNotifications={handleDismissNotifications}
            />
            <Outlet />
          </div>
        </div>
      </div>

      <CreateGroupModal
        creatingGroup={creatingGroup}
        newGroupName={newGroupName}
        newGroupTheme={newGroupTheme}
        groupError={groupError}
        groupSaving={groupSaving}
        setCreatingGroup={setCreatingGroup}
        setNewGroupName={setNewGroupName}
        setNewGroupTheme={setNewGroupTheme}
        onSubmit={handleCreateGroup}
      />

      <EditProfileModal
        editingProfile={editingProfile}
        profileForm={profileForm}
        profileError={profileError}
        profileSaving={profileSaving}
        setEditingProfile={setEditingProfile}
        setProfileForm={setProfileForm}
        onSubmit={handleSaveProfile}
      />

      <PasskeysModal
        managingPasskeys={managingPasskeys}
        passkeysLoading={passkeysLoading}
        passkeys={passkeys}
        passkeysSaving={passkeysSaving}
        passkeysActionId={passkeysActionId}
        passkeysError={passkeysError}
        user={user}
        setManagingPasskeys={setManagingPasskeys}
        setPasskeys={setPasskeys}
        onRenamePasskey={handleRenamePasskey}
        onDeletePasskey={handleDeletePasskey}
        onAddPasskey={handleAddPasskey}
      />

      {scannerOpen ? (
        <InviteQrScannerModal
          onClose={() => setScannerOpen(false)}
          onDetected={handleInviteDetected}
        />
      ) : null}
    </div>
  );
}
