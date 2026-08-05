import { useCallback, useEffect, useState } from 'react';
import { Archive, Check, History, Link2, RefreshCw, RotateCcw, Settings, Tags, Trash2, Users, UsersRound } from 'lucide-react';
import { get, post, put, del } from '../api/client.js';
import UserAvatar from '../components/UserAvatar.jsx';
import { CATEGORY_ICON_OPTIONS, getCategoryIcon } from '../lib/expenseCategories.js';
import { GROUP_THEMES, getThemeForGroup } from '../lib/groupTheme.js';
import { getUserDisplayName } from '../lib/users.js';

function AdminSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((item) => (
        <div key={item} className="space-y-3 rounded-lg border border-[var(--border-subtle)] p-4">
          <div className="skeleton h-11 rounded-lg" />
          <div className="skeleton h-11 rounded-lg" />
          <div className="skeleton h-11 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

const ACTIVITY_PAGE_SIZE = 25;

const ACTIVITY_EVENT_OPTIONS = [
  { value: '', label: 'Alla händelser' },
  { value: 'auth.login.succeeded', label: 'Inloggning lyckad' },
  { value: 'auth.login.failed', label: 'Inloggning misslyckad' },
  { value: 'auth.passkey.created', label: 'Passkey skapad' },
  { value: 'auth.passkey.updated', label: 'Passkey uppdaterad' },
  { value: 'auth.passkey.deleted', label: 'Passkey borttagen' },
  { value: 'expense.created', label: 'Utgift skapad' },
  { value: 'expense.updated', label: 'Utgift uppdaterad' },
  { value: 'expense.deleted', label: 'Utgift borttagen' },
  { value: 'settlement.created', label: 'Betalning skapad' },
  { value: 'settlement.updated', label: 'Betalning uppdaterad' },
  { value: 'settlement.deleted', label: 'Betalning borttagen' },
  { value: 'group.created', label: 'Grupp skapad' },
  { value: 'group.updated', label: 'Grupp uppdaterad' },
  { value: 'group.archived', label: 'Grupp arkiverad' },
  { value: 'group.unarchived', label: 'Grupp återaktiverad' },
  { value: 'group.deleted', label: 'Grupp borttagen' },
  { value: 'group.member.added', label: 'Medlem tillagd' },
  { value: 'group.member.removed', label: 'Medlem borttagen' },
  { value: 'admin.user.updated', label: 'Admin: användare uppdaterad' },
  { value: 'admin.user.deleted', label: 'Admin: användare borttagen' },
  { value: 'admin.group.updated', label: 'Admin: grupp uppdaterad' },
  { value: 'admin.category.updated', label: 'Admin: kategori uppdaterad' },
];

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('sv-SE');
}

function toGroupDraft(group) {
  return {
    name: group.name,
    theme_color: group.theme_color ?? null,
    mileage_rate: Number(group.mileage_rate) > 0 ? group.mileage_rate : 20,
  };
}

function applyUpdatedGroupState(groupId, updated, setGroups, setGroupDrafts) {
  setGroups((previous) => previous.map((group) => (group.id === groupId ? updated : group)));
  setGroupDrafts((previous) => ({
    ...previous,
    [groupId]: toGroupDraft(updated),
  }));
}

function buildActivityLogQuery(activityPage, activityFilters) {
  const params = new URLSearchParams();
  params.set('page', String(activityPage));
  params.set('pageSize', String(ACTIVITY_PAGE_SIZE));
  if (activityFilters.event_type) params.set('event_type', activityFilters.event_type);
  if (activityFilters.actor_user_id) params.set('actor_user_id', String(activityFilters.actor_user_id));
  if (activityFilters.group_id) params.set('group_id', String(activityFilters.group_id));
  if (activityFilters.query) params.set('query', activityFilters.query);
  if (activityFilters.from) params.set('from', activityFilters.from);
  if (activityFilters.to) params.set('to', activityFilters.to);
  return params.toString();
}

function AdminRegistrationTab({
  registrationToken,
  registrationUrl,
  setRegistrationToken,
  handleSaveRegistrationToken,
  handleResetRegistrationToken,
  handleCopyRegistrationUrl,
  savingRegistration,
  resettingRegistration,
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="m-0 text-base font-semibold">Registreringslänk</h2>
        <p className="m-0 text-sm text-[var(--text-secondary)]">Endast besökare med denna länk kan skapa konto.</p>
      </div>
      <label className="field-label">
        <span>Registreringsnyckel</span>
        <input
          value={registrationToken}
          onChange={(event) => setRegistrationToken(event.target.value)}
          placeholder="Lång unik nyckel"
        />
      </label>
      <label className="field-label">
        <span>Registrerings-URL</span>
        <input value={registrationUrl} readOnly />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={handleSaveRegistrationToken} disabled={savingRegistration || resettingRegistration || registrationToken.trim().length < 16}>
          {savingRegistration ? 'Sparar...' : 'Spara nyckel'}
        </button>
        <button type="button" className="btn-secondary" onClick={handleResetRegistrationToken} disabled={savingRegistration || resettingRegistration}>
          <RefreshCw className="h-4 w-4" />
          {resettingRegistration ? 'Återställer...' : 'Återställ nyckel'}
        </button>
        <button type="button" className="btn-secondary" onClick={handleCopyRegistrationUrl} disabled={!registrationUrl}>
          <Link2 className="h-4 w-4" />
          Kopiera länk
        </button>
      </div>
    </div>
  );
}

function AdminUsersTab({
  users,
  userDrafts,
  recoveryUrls,
  generatingRecoveryUserId,
  savingUserId,
  deletingUserId,
  handleUserDraftChange,
  handleSaveUser,
  handleGenerateRecoveryLink,
  handleDeleteUser,
  handleCopyRecoveryUrl,
}) {
  return (
    <div className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)]">
      <div className="hidden items-center gap-x-3 px-4 py-2 sm:flex">
        <span className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Namn</span>
        <span className="w-14 shrink-0 text-center text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Admin</span>
        <span className="w-16 shrink-0 text-center text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Grupper</span>
        <span className="w-16 shrink-0 text-center text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Passkeys</span>
        <span className="w-9 shrink-0" />
        <span className="w-9 shrink-0" />
        <span className="w-9 shrink-0" />
      </div>
      {users.map((user) => (
        <AdminUserRow
          key={user.id}
          user={user}
          draft={userDrafts[user.id] || { is_admin: false, full_name: '' }}
          recoveryUrl={recoveryUrls[user.id]}
          isGenerating={generatingRecoveryUserId === user.id}
          savingUserId={savingUserId}
          deletingUserId={deletingUserId}
          onDraftChange={handleUserDraftChange}
          onSaveUser={handleSaveUser}
          onGenerateRecoveryLink={handleGenerateRecoveryLink}
          onDeleteUser={handleDeleteUser}
          onCopyRecoveryUrl={handleCopyRecoveryUrl}
        />
      ))}
    </div>
  );
}

function getSaveButtonClass(isDirty) {
  return `size-9 min-h-0 shrink-0 rounded-lg border p-0 text-sm font-semibold transition-colors ${isDirty ? 'border-[var(--accent)] bg-[var(--accent)] text-white hover:opacity-90' : 'cursor-not-allowed border-[var(--border-subtle)] bg-[var(--app-surface-strong)] text-[var(--text-muted)]'}`;
}

function getDeleteButtonClass(hasGroups) {
  return `size-9 min-h-0 shrink-0 rounded-lg border p-0 text-sm font-semibold transition-colors ${hasGroups ? 'cursor-not-allowed border-[var(--border-subtle)] bg-[var(--app-surface-strong)] text-[var(--text-muted)]' : 'border-[var(--danger)] bg-[var(--danger)] text-white hover:opacity-90'}`;
}

function getRecoveryButtonTitle(passkeyCount) {
  if (passkeyCount === 0) {
    return 'Användaren saknar passkeys – använd registreringslänken';
  }
  return 'Generera återhämtningslänk';
}

function AdminUserSaveButton({ userId, isDirty, isBusy, savingUserId, onSaveUser }) {
  const isSaving = savingUserId === userId;
  return (
    <button
      type="button"
      className={getSaveButtonClass(isDirty)}
      onClick={() => onSaveUser(userId)}
      disabled={!isDirty || isBusy}
      title="Spara ändringar"
    >
      {isSaving ? '…' : <Check className="mx-auto h-4 w-4" />}
    </button>
  );
}

function AdminUserRecoveryButton({ userId, passkeyCount, isGenerating, isBusy, onGenerateRecoveryLink }) {
  return (
    <button
      type="button"
      className="size-9 min-h-0 shrink-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] p-0 text-sm font-semibold transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
      onClick={() => onGenerateRecoveryLink(userId)}
      disabled={isGenerating || passkeyCount === 0 || isBusy}
      title={getRecoveryButtonTitle(passkeyCount)}
    >
      {isGenerating ? '…' : <Link2 className="mx-auto h-4 w-4" />}
    </button>
  );
}

function AdminUserDeleteButton({ userId, hasGroups, isBusy, deletingUserId, onDeleteUser }) {
  const isDeleting = deletingUserId === userId;
  return (
    <button
      type="button"
      className={getDeleteButtonClass(hasGroups)}
      onClick={() => onDeleteUser(userId)}
      disabled={hasGroups || isBusy}
      title={hasGroups ? 'Kan inte radera användare med grupper' : 'Radera användare'}
    >
      {isDeleting ? '...' : '×'}
    </button>
  );
}

function AdminUserRecoveryUrl({ userId, recoveryUrl, onCopyRecoveryUrl }) {
  if (!recoveryUrl) {
    return null;
  }

  return (
    <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-[color:color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_6%,transparent)] px-3 py-2">
      <input
        readOnly
        value={recoveryUrl}
        className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text-secondary)]"
        onFocus={(event) => event.target.select()}
      />
      <button
        type="button"
        className="btn-secondary shrink-0 px-2 py-1 text-xs"
        onClick={() => onCopyRecoveryUrl(userId)}
      >
        Kopiera
      </button>
    </div>
  );
}

function AdminUserRow({
  user,
  draft,
  recoveryUrl,
  isGenerating,
  savingUserId,
  deletingUserId,
  onDraftChange,
  onSaveUser,
  onGenerateRecoveryLink,
  onDeleteUser,
  onCopyRecoveryUrl,
}) {
  const isDirty = draft.full_name !== user.full_name || Boolean(draft.is_admin) !== Boolean(user.is_admin);
  const isBusy = savingUserId === user.id || deletingUserId === user.id;
  const hasGroups = user.group_count > 0;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-x-3 px-4 py-2">
        <UserAvatar
          user={user}
          title={getUserDisplayName(user)}
          className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--app-surface-strong)] ring-1 ring-black/35"
          imageClassName="h-full w-full object-cover"
          initialsClassName="text-xs font-semibold text-[var(--text-primary)]"
        />
        <input
          className="min-w-0 flex-1"
          value={draft.full_name || ''}
          onChange={(event) => onDraftChange(user.id, 'full_name', event.target.value)}
          aria-label="Fullständigt namn"
        />
        <div className="hidden w-14 shrink-0 justify-center sm:flex">
          <input
            type="checkbox"
            checked={Boolean(draft.is_admin)}
            onChange={(event) => onDraftChange(user.id, 'is_admin', event.target.checked)}
          />
        </div>
        <span className="hidden w-16 shrink-0 text-center text-sm text-[var(--text-muted)] sm:block">{user.group_count}</span>
        <span className="hidden w-16 shrink-0 text-center text-sm text-[var(--text-muted)] sm:block">{user.passkey_count}</span>
        <AdminUserSaveButton
          userId={user.id}
          isDirty={isDirty}
          isBusy={isBusy}
          savingUserId={savingUserId}
          onSaveUser={onSaveUser}
        />
        <AdminUserRecoveryButton
          userId={user.id}
          passkeyCount={user.passkey_count}
          isGenerating={isGenerating}
          isBusy={isBusy}
          onGenerateRecoveryLink={onGenerateRecoveryLink}
        />
        <AdminUserDeleteButton
          userId={user.id}
          hasGroups={hasGroups}
          isBusy={isBusy}
          deletingUserId={deletingUserId}
          onDeleteUser={onDeleteUser}
        />
      </div>
      <div className="flex items-center gap-4 px-4 pb-2 sm:hidden">
        <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={Boolean(draft.is_admin)}
            onChange={(event) => onDraftChange(user.id, 'is_admin', event.target.checked)}
          />
          <span>Admin</span>
        </label>
        <span className="text-xs text-[var(--text-muted)]">{user.group_count} grupper</span>
        <span className="text-xs text-[var(--text-muted)]">{user.passkey_count} passkeys</span>
      </div>
      <AdminUserRecoveryUrl userId={user.id} recoveryUrl={recoveryUrl} onCopyRecoveryUrl={onCopyRecoveryUrl} />
    </div>
  );
}

function AdminGroupList({ groups, selectedGroupId, setSelectedGroupId }) {
  return (
    <aside className="space-y-2">
      {groups.map((group) => {
        const theme = getThemeForGroup(group);
        const isActive = selectedGroupId === group.id;
        return (
          <button
            key={group.id}
            type="button"
            onClick={() => setSelectedGroupId(group.id)}
            className={[
              'w-full rounded-lg border px-4 py-3 text-left transition',
              isActive
                ? 'border-[var(--border-strong)] bg-[var(--app-surface-muted)]'
                : 'border-[var(--border-subtle)] bg-[var(--app-surface-strong)] hover:bg-[var(--app-surface-muted)]',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 truncate text-sm font-semibold">{group.name}</p>
                <p className="mt-1 m-0 text-xs text-[var(--text-secondary)]">{group.member_count} medlemmar</p>
              </div>
              <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: theme.base }} />
            </div>
          </button>
        );
      })}
    </aside>
  );
}

function GroupArchiveAction({ selectedGroup, groupAction, handleArchiveGroup, handleUnarchiveGroup }) {
  const isBusy = groupAction.id === selectedGroup.id;

  if (selectedGroup.archived_at) {
    return (
      <button
        type="button"
        className="btn-secondary"
        onClick={() => handleUnarchiveGroup(selectedGroup.id)}
        disabled={isBusy}
      >
        <RotateCcw className="h-4 w-4" />
        {isBusy && groupAction.type === 'unarchive' ? 'Återaktiverar...' : 'Återaktivera'}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={() => handleArchiveGroup(selectedGroup.id)}
      disabled={isBusy || Boolean(selectedGroup.has_open_balances)}
      title={selectedGroup.has_open_balances ? 'Kan inte arkivera förrän alla balanser är 0.' : undefined}
    >
      <Archive className="h-4 w-4" />
      {isBusy && groupAction.type === 'archive' ? 'Arkiverar...' : 'Arkivera'}
    </button>
  );
}

function getGroupStatusMessage(selectedGroup) {
  if (selectedGroup.archived_at) {
    return 'Gruppen är arkiverad och kan inte redigeras förrän den återaktiveras.';
  }
  if (selectedGroup.has_open_balances) {
    return 'Gruppen kan inte arkiveras förrän allas balans är 0.';
  }
  return '';
}

function AdminGroupDetails({
  selectedGroup,
  selectedGroupDraft,
  handleGroupDraftChange,
  handleUnarchiveGroup,
  handleArchiveGroup,
  handleDeleteGroup,
  handleSaveGroup,
  savingGroupId,
  groupAction,
}) {
  if (!selectedGroup || !selectedGroupDraft) {
    return (
      <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-6">
        <p className="m-0 text-sm text-[var(--text-secondary)]">Välj en grupp i listan för att redigera inställningar.</p>
      </section>
    );
  }

  const activeThemeId = selectedGroupDraft.theme_color ?? getThemeForGroup(selectedGroup).id;
  const statusMessage = getGroupStatusMessage(selectedGroup);

  return (
    <section className="space-y-6 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-5 sm:p-6">
      <div className="space-y-1">
        <p className="section-eyebrow">Grupp</p>
        <h3 className="m-0 text-lg font-semibold">Gruppinställningar</h3>
        <p className="m-0 text-sm text-[var(--text-secondary)]">Redigera namn och färgtema för vald grupp.</p>
      </div>

      <div className="space-y-3">
        <label className="field-label">
          <span>Gruppnamn</span>
          <input
            value={selectedGroupDraft.name}
            onChange={(event) => handleGroupDraftChange(selectedGroup.id, 'name', event.target.value)}
            disabled={Boolean(selectedGroup.archived_at)}
          />
        </label>
        <label className="field-label">
          <span>Milkostnad för Bil (kr/mil)</span>
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={selectedGroupDraft.mileage_rate}
            onChange={(event) => handleGroupDraftChange(selectedGroup.id, 'mileage_rate', event.target.value)}
            disabled={Boolean(selectedGroup.archived_at)}
          />
        </label>
      </div>

      <div className="space-y-3">
        <p className="field-label">Färgtema</p>
        <div className="flex flex-wrap gap-2">
          {GROUP_THEMES.map((theme) => {
            const isActive = activeThemeId === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                title={theme.name}
                onClick={() => handleGroupDraftChange(selectedGroup.id, 'theme_color', theme.id)}
                disabled={Boolean(selectedGroup.archived_at)}
                className="h-7 w-7 rounded-full transition hover:scale-110 focus:outline-none focus-visible:ring-2"
                style={{
                  background: theme.base,
                  outline: isActive ? `2px solid ${theme.base}` : undefined,
                  outlineOffset: isActive ? '2px' : undefined,
                  boxShadow: isActive ? `0 0 0 3px rgba(255,255,255,0.9), 0 0 0 5px ${theme.base}` : undefined,
                }}
                aria-pressed={isActive}
                aria-label={theme.name}
              />
            );
          })}
        </div>
      </div>

      <div className="space-y-1 text-sm text-[var(--text-secondary)]">
        <p className="m-0">Skapad av: {getUserDisplayName({ full_name: selectedGroup.created_by_full_name })}</p>
        <p className="m-0">Antal medlemmar: {selectedGroup.member_count}</p>
        <p className="m-0">Status: {selectedGroup.archived_at ? 'Arkiverad' : 'Aktiv'}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <GroupArchiveAction
          selectedGroup={selectedGroup}
          groupAction={groupAction}
          handleArchiveGroup={handleArchiveGroup}
          handleUnarchiveGroup={handleUnarchiveGroup}
        />
        <button
          type="button"
          className="btn-danger"
          onClick={() => handleDeleteGroup(selectedGroup.id)}
          disabled={groupAction.id === selectedGroup.id}
        >
          <Trash2 className="h-4 w-4" />
          {groupAction.id === selectedGroup.id && groupAction.type === 'delete' ? 'Raderar...' : 'Radera grupp'}
        </button>
      </div>

      {statusMessage ? (
        <p className="m-0 text-sm text-[var(--text-secondary)]">{statusMessage}</p>
      ) : null}

      <button
        type="button"
        className="btn-primary"
        onClick={() => handleSaveGroup(selectedGroup.id)}
        disabled={savingGroupId === selectedGroup.id || Boolean(selectedGroup.archived_at) || groupAction.id === selectedGroup.id}
      >
        {savingGroupId === selectedGroup.id ? 'Sparar...' : 'Spara grupp'}
      </button>
    </section>
  );
}

function AdminGroupsTab({
  groups,
  selectedGroupId,
  setSelectedGroupId,
  selectedGroup,
  selectedGroupDraft,
  handleGroupDraftChange,
  handleUnarchiveGroup,
  handleArchiveGroup,
  handleDeleteGroup,
  handleSaveGroup,
  savingGroupId,
  groupAction,
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <AdminGroupList
        groups={groups}
        selectedGroupId={selectedGroupId}
        setSelectedGroupId={setSelectedGroupId}
      />
      <AdminGroupDetails
        selectedGroup={selectedGroup}
        selectedGroupDraft={selectedGroupDraft}
        handleGroupDraftChange={handleGroupDraftChange}
        handleUnarchiveGroup={handleUnarchiveGroup}
        handleArchiveGroup={handleArchiveGroup}
        handleDeleteGroup={handleDeleteGroup}
        handleSaveGroup={handleSaveGroup}
        savingGroupId={savingGroupId}
        groupAction={groupAction}
      />
    </div>
  );
}

function buildCategoryIconOptions(normalizedIconId) {
  const hasKnownIcon = CATEGORY_ICON_OPTIONS.some((option) => option.id === normalizedIconId);
  if (hasKnownIcon) {
    return CATEGORY_ICON_OPTIONS;
  }
  return [{ id: normalizedIconId, label: `${normalizedIconId} (befintlig)` }, ...CATEGORY_ICON_OPTIONS];
}

function AdminCategoriesTab({ categories, categoryDrafts, handleCategoryDraftChange, handleSaveCategory, savingCategoryId }) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)]">
        <table className="min-w-[780px] w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--app-surface-strong)] text-left">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Kategorinamn</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Ikon</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Sortering</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Förhandsvisning</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Åtgärd</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => {
              const draft = categoryDrafts[category.id] ?? {
                name: category.name,
                icon: category.icon,
                sort_order: category.sort_order,
              };
              const normalizedIconId = String(draft.icon || '')
                .trim()
                .toLowerCase()
                .replace(/[_\s]+/g, '-');
              const iconOptions = buildCategoryIconOptions(normalizedIconId);
              const CategoryIcon = getCategoryIcon(draft.icon);
              return (
                <tr key={category.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                  <td className="px-4 py-3 align-top">
                    <input
                      className="max-w-md"
                      value={draft.name}
                      onChange={(event) => handleCategoryDraftChange(category.id, 'name', event.target.value)}
                      maxLength={16}
                      aria-label="Kategorinamn"
                    />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <select
                      className="max-w-xs"
                      value={normalizedIconId}
                      onChange={(event) => handleCategoryDraftChange(category.id, 'icon', event.target.value)}
                      aria-label="Ikon"
                    >
                      {iconOptions.map((iconOption) => (
                        <option key={iconOption.id} value={iconOption.id}>{iconOption.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <input
                      type="number"
                      className="w-24"
                      min="0"
                      max="99"
                      step="1"
                      value={draft.sort_order}
                      onChange={(event) => handleCategoryDraftChange(category.id, 'sort_order', event.target.value)}
                      aria-label="Sortering"
                    />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="inline-flex min-h-11 min-w-40 cursor-not-allowed items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[color:color-mix(in_srgb,var(--app-surface-muted)_88%,white)] px-3 py-2 text-sm text-[var(--text-muted)] opacity-85" aria-readonly="true">
                      <CategoryIcon className="h-4 w-4" />
                      <span>{(draft.name || '').trim() || 'Namnlös kategori'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <button type="button" className="btn-primary" onClick={() => handleSaveCategory(category.id)} disabled={savingCategoryId === category.id}>
                      {savingCategoryId === category.id ? 'Sparar...' : 'Spara'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminActivityTab({
  activityFilters,
  handleActivityFilterChange,
  users,
  groups,
  activityTotal,
  activityLoading,
  activityPage,
  setActivityPage,
  activityLogs,
  expandedActivityId,
  setExpandedActivityId,
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="field-label">
          <span>Händelse</span>
          <select
            value={activityFilters.event_type}
            onChange={(event) => handleActivityFilterChange('event_type', event.target.value)}
          >
            {ACTIVITY_EVENT_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          <span>Användare</span>
          <select
            value={activityFilters.actor_user_id}
            onChange={(event) => handleActivityFilterChange('actor_user_id', event.target.value)}
          >
            <option value="">Alla användare</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{getUserDisplayName(user)}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          <span>Grupp</span>
          <select
            value={activityFilters.group_id}
            onChange={(event) => handleActivityFilterChange('group_id', event.target.value)}
          >
            <option value="">Alla grupper</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          <span>Från</span>
          <input
            type="datetime-local"
            value={activityFilters.from}
            onChange={(event) => handleActivityFilterChange('from', event.target.value)}
          />
        </label>
        <label className="field-label">
          <span>Till</span>
          <input
            type="datetime-local"
            value={activityFilters.to}
            onChange={(event) => handleActivityFilterChange('to', event.target.value)}
          />
        </label>
        <label className="field-label">
          <span>Söktext</span>
          <input
            value={activityFilters.query}
            onChange={(event) => handleActivityFilterChange('query', event.target.value)}
            placeholder="Sök i händelser och metadata"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--text-secondary)]">
        <span>{activityTotal} händelser</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={activityLoading || activityPage <= 1}
            onClick={() => setActivityPage((previous) => Math.max(1, previous - 1))}
          >
            Föregående
          </button>
          <span>Sida {activityPage}</span>
          <button
            type="button"
            className="btn-secondary"
            disabled={activityLoading || activityPage * ACTIVITY_PAGE_SIZE >= activityTotal}
            onClick={() => setActivityPage((previous) => previous + 1)}
          >
            Nästa
          </button>
        </div>
      </div>

      {activityLoading ? (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4 text-sm text-[var(--text-secondary)]">
          Laddar aktivitetslogg...
        </div>
      ) : null}

      {!activityLoading ? (
        <div className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)]">
          {activityLogs.map((item) => {
            const actorName = item.actor_full_name || (item.actor_user_id ? `Användare ${item.actor_user_id}` : 'Okänd');
            const targetName = item.target_full_name || (item.target_user_id ? `Användare ${item.target_user_id}` : null);
            const isExpanded = expandedActivityId === item.id;
            return (
              <article key={item.id} className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => setExpandedActivityId((previous) => (previous === item.id ? null : item.id))}
                  className="w-full text-left"
                >
                  <div className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)_180px] md:items-center">
                    <p className="m-0 text-xs text-[var(--text-muted)]">{formatDateTime(item.created_at)}</p>
                    <div className="min-w-0">
                      <p className="m-0 truncate text-sm font-semibold">{item.event_type}</p>
                      <p className="m-0 truncate text-xs text-[var(--text-secondary)]">
                        {actorName}
                        {targetName ? ` → ${targetName}` : ''}
                        {item.group_name ? ` • ${item.group_name}` : ''}
                      </p>
                    </div>
                    <p className="m-0 text-xs text-[var(--text-muted)] md:text-right">{item.entity_type}{item.entity_id ? ` #${item.entity_id}` : ''}</p>
                  </div>
                </button>
                {isExpanded ? (
                  <pre className="mt-3 overflow-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] p-3 text-xs text-[var(--text-secondary)]">
{JSON.stringify(item.metadata || {}, null, 2)}
                  </pre>
                ) : null}
              </article>
            );
          })}
          {!activityLogs.length ? (
            <p className="m-0 px-4 py-6 text-sm text-[var(--text-secondary)]">Inga händelser matchar filtret.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [userDrafts, setUserDrafts] = useState({});
  const [groupDrafts, setGroupDrafts] = useState({});
  const [categoryDrafts, setCategoryDrafts] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [generatingRecoveryUserId, setGeneratingRecoveryUserId] = useState(null);
  const [recoveryUrls, setRecoveryUrls] = useState({});
  const [savingGroupId, setSavingGroupId] = useState(null);
  const [groupAction, setGroupAction] = useState({ id: null, type: '' });
  const [savingCategoryId, setSavingCategoryId] = useState(null);
  const [activeTab, setActiveTab] = useState('admin');
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [registrationToken, setRegistrationToken] = useState('');
  const [registrationUrl, setRegistrationUrl] = useState('');
  const [savingRegistration, setSavingRegistration] = useState(false);
  const [resettingRegistration, setResettingRegistration] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [expandedActivityId, setExpandedActivityId] = useState(null);
  const [activityFilters, setActivityFilters] = useState({
    event_type: '',
    actor_user_id: '',
    group_id: '',
    query: '',
    from: '',
    to: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersData, groupsData, categoriesData, registrationData] = await Promise.all([
        get('/api/admin/users'),
        get('/api/admin/groups'),
        get('/api/admin/categories'),
        get('/api/admin/registration-access'),
      ]);
      setUsers(usersData);
      setGroups(groupsData);
      setCategories(categoriesData);
      setUserDrafts(Object.fromEntries(usersData.map((user) => [user.id, {
        is_admin: Boolean(user.is_admin),
        full_name: user.full_name,
      }])));
      setGroupDrafts(Object.fromEntries(groupsData.map((group) => [group.id, {
        ...toGroupDraft(group),
      }])));
      setCategoryDrafts(Object.fromEntries(categoriesData.map((category) => [category.id, {
        name: category.name,
        icon: category.icon,
        sort_order: category.sort_order,
      }])));
      setSelectedGroupId((previous) => {
        if (!groupsData.length) return null;
        if (previous && groupsData.some((group) => group.id === previous)) return previous;
        return groupsData[0].id;
      });
      setRegistrationToken(registrationData.token || '');
      setRegistrationUrl(registrationData.registration_url || '');
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUserDraftChange = (userId, key, value) => {
    setUserDrafts((previous) => ({
      ...previous,
      [userId]: { ...previous[userId], [key]: value },
    }));
  };

  const handleGroupDraftChange = (groupId, key, value) => {
    setGroupDrafts((previous) => ({
      ...previous,
      [groupId]: { ...previous[groupId], [key]: value },
    }));
  };

  const handleCategoryDraftChange = (categoryId, key, value) => {
    setCategoryDrafts((previous) => ({
      ...previous,
      [categoryId]: { ...previous[categoryId], [key]: value },
    }));
  };

  const handleDeleteUser = async (userId) => {
    const user = users.find((entry) => entry.id === userId);
    const userLabel = (user?.full_name || '').trim() || `ID ${userId}`;
    if (!window.confirm(`Är du säker på att du vill radera användaren ${userLabel}? Detta kan inte ångras.`)) {
      return;
    }

    setDeletingUserId(userId);
    setError('');
    try {
      await del(`/api/admin/users/${userId}`);
      setUsers((previous) => previous.filter((user) => user.id !== userId));
      setUserDrafts((previous) => {
        const next = { ...previous };
        delete next[userId];
        return next;
      });
      setRecoveryUrls((previous) => {
        const next = { ...previous };
        delete next[userId];
        return next;
      });
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleGenerateRecoveryLink = async (userId) => {
    setGeneratingRecoveryUserId(userId);
    setError('');
    try {
      const data = await post(`/api/admin/users/${userId}/recovery-link`, {});
      setRecoveryUrls((previous) => ({ ...previous, [userId]: data.url }));
    } catch (genError) {
      setError(genError.message);
    } finally {
      setGeneratingRecoveryUserId(null);
    }
  };

  const handleCopyRecoveryUrl = async (userId) => {
    const url = recoveryUrls[userId];
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      setError('Kunde inte kopiera länken.');
    }
  };

  const handleSaveUser = async (userId) => {
    const draft = userDrafts[userId];
    if (!draft) return;
    setSavingUserId(userId);
    setError('');
    try {
      const updated = await put(`/api/admin/users/${userId}`, {
        is_admin: Boolean(draft.is_admin),
        full_name: draft.full_name,
      });
      setUsers((previous) => previous.map((user) => (user.id === userId ? updated : user)));
      setUserDrafts((previous) => ({
        ...previous,
        [userId]: { is_admin: Boolean(updated.is_admin), full_name: updated.full_name },
      }));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingUserId(null);
    }
  };

  const handleSaveGroup = async (groupId) => {
    const draft = groupDrafts[groupId];
    if (!draft) return;
    setSavingGroupId(groupId);
    setError('');
    try {
      const updated = await put(`/api/admin/groups/${groupId}`, {
        name: draft.name,
        theme_color: draft.theme_color ?? null,
        mileage_rate: Number(draft.mileage_rate) > 0 ? Number(draft.mileage_rate) : 20,
      });
      applyUpdatedGroupState(groupId, updated, setGroups, setGroupDrafts);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingGroupId(null);
    }
  };

  const handleArchiveGroup = async (groupId) => {
    setGroupAction({ id: groupId, type: 'archive' });
    setError('');
    try {
      const updated = await post(`/api/admin/groups/${groupId}/archive`, {});
      applyUpdatedGroupState(groupId, updated, setGroups, setGroupDrafts);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setGroupAction({ id: null, type: '' });
    }
  };

  const handleUnarchiveGroup = async (groupId) => {
    setGroupAction({ id: groupId, type: 'unarchive' });
    setError('');
    try {
      const updated = await post(`/api/admin/groups/${groupId}/unarchive`, {});
      applyUpdatedGroupState(groupId, updated, setGroups, setGroupDrafts);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setGroupAction({ id: null, type: '' });
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Är du säker på att du vill radera gruppen permanent? Detta kan inte ångras.')) {
      return;
    }
    setGroupAction({ id: groupId, type: 'delete' });
    setError('');
    try {
      await del(`/api/admin/groups/${groupId}`);
      setGroups((previous) => {
        const next = previous.filter((group) => group.id !== groupId);
        setSelectedGroupId((current) => {
          if (current !== groupId) {
            return current;
          }
          return next.length ? next[0].id : null;
        });
        return next;
      });
      setGroupDrafts((previous) => {
        const next = { ...previous };
        delete next[groupId];
        return next;
      });
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setGroupAction({ id: null, type: '' });
    }
  };

  const handleSaveCategory = async (categoryId) => {
    const draft = categoryDrafts[categoryId];
    if (!draft) return;
    const normalizedSortOrder = Math.min(99, Math.max(0, Number.parseInt(draft.sort_order, 10) || 0));
    setSavingCategoryId(categoryId);
    setError('');
    try {
      const updated = await put(`/api/admin/categories/${categoryId}`, {
        name: draft.name,
        icon: draft.icon,
        sort_order: normalizedSortOrder,
      });
      setCategories((previous) => previous.map((category) => (category.id === categoryId ? updated : category)));
      setCategoryDrafts((previous) => ({
        ...previous,
        [categoryId]: {
          name: updated.name,
          icon: updated.icon,
          sort_order: updated.sort_order,
        },
      }));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingCategoryId(null);
    }
  };

  const updateRegistrationAccess = (data) => {
    setRegistrationToken(data.token || '');
    setRegistrationUrl(data.registration_url || '');
  };

  const handleSaveRegistrationToken = async () => {
    setSavingRegistration(true);
    setError('');
    try {
      const updated = await put('/api/admin/registration-access', { token: registrationToken.trim() });
      updateRegistrationAccess(updated);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingRegistration(false);
    }
  };

  const handleResetRegistrationToken = async () => {
    setResettingRegistration(true);
    setError('');
    try {
      const updated = await post('/api/admin/registration-access/reset', {});
      updateRegistrationAccess(updated);
    } catch (resetError) {
      setError(resetError.message);
    } finally {
      setResettingRegistration(false);
    }
  };

  const handleCopyRegistrationUrl = async () => {
    setError('');
    try {
      await navigator.clipboard.writeText(registrationUrl);
    } catch {
      setError('Kunde inte kopiera länken.');
    }
  };

  const loadActivityLogs = useCallback(async () => {
    setActivityLoading(true);
    setError('');
    try {
      const data = await get(`/api/admin/activity-logs?${buildActivityLogQuery(activityPage, activityFilters)}`);
      setActivityLogs(Array.isArray(data.items) ? data.items : []);
      setActivityTotal(Number(data.total || 0));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setActivityLoading(false);
    }
  }, [activityFilters, activityPage]);

  useEffect(() => {
    if (loading || activeTab !== 'activity') {
      return;
    }
    loadActivityLogs();
  }, [activeTab, loading, loadActivityLogs]);

  const handleActivityFilterChange = (key, value) => {
    setActivityPage(1);
    setActivityFilters((previous) => ({ ...previous, [key]: value }));
  };

  const tabs = [
    { id: 'admin', label: 'Admin', icon: Settings, count: null },
    { id: 'users', label: 'Användare', icon: Users, count: users.length },
    { id: 'groups', label: 'Grupper', icon: UsersRound, count: groups.length },
    { id: 'categories', label: 'Kategorier', icon: Tags, count: categories.length },
    { id: 'activity', label: 'Aktivitetslogg', icon: History, count: activityTotal },
  ];
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const selectedGroupDraft = selectedGroup ? (groupDrafts[selectedGroup.id] ?? {
    name: selectedGroup.name,
    theme_color: selectedGroup.theme_color ?? null,
    mileage_rate: Number(selectedGroup.mileage_rate) > 0 ? selectedGroup.mileage_rate : 20,
  }) : null;

  return (
    <div className="space-y-8">
      <div className="surface-card overflow-x-hidden">
        {error ? <p className="mx-6 mt-4 rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}
        {/* Mobile: dropdown */}
        <div className="border-b border-[var(--border-subtle)] px-4 py-3 sm:hidden">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            aria-label="Välj sektion"
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}{!loading && tab.count !== null ? ` (${tab.count})` : ''}
              </option>
            ))}
          </select>
        </div>
        {/* Desktop: tab bar */}
        <div className="hidden border-b border-[var(--border-subtle)] sm:flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition border-b-2 -mb-px',
                activeTab === tab.id
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              ].join(' ')}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {!loading && tab.count !== null ? (
                <span className={[
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  activeTab === tab.id
                    ? 'bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]'
                    : 'bg-[var(--app-surface-muted)] text-[var(--text-muted)]',
                ].join(' ')}>
                  {tab.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="p-6">
          {loading ? <AdminSkeleton /> : null}

          {!loading && activeTab === 'admin' ? (
            <AdminRegistrationTab
              registrationToken={registrationToken}
              registrationUrl={registrationUrl}
              setRegistrationToken={setRegistrationToken}
              handleSaveRegistrationToken={handleSaveRegistrationToken}
              handleResetRegistrationToken={handleResetRegistrationToken}
              handleCopyRegistrationUrl={handleCopyRegistrationUrl}
              savingRegistration={savingRegistration}
              resettingRegistration={resettingRegistration}
            />
          ) : null}

          {!loading && activeTab === 'users' ? (
            <AdminUsersTab
              users={users}
              userDrafts={userDrafts}
              recoveryUrls={recoveryUrls}
              generatingRecoveryUserId={generatingRecoveryUserId}
              savingUserId={savingUserId}
              deletingUserId={deletingUserId}
              handleUserDraftChange={handleUserDraftChange}
              handleSaveUser={handleSaveUser}
              handleGenerateRecoveryLink={handleGenerateRecoveryLink}
              handleDeleteUser={handleDeleteUser}
              handleCopyRecoveryUrl={handleCopyRecoveryUrl}
            />
          ) : null}

          {!loading && activeTab === 'groups' ? (
            <AdminGroupsTab
              groups={groups}
              selectedGroupId={selectedGroupId}
              setSelectedGroupId={setSelectedGroupId}
              selectedGroup={selectedGroup}
              selectedGroupDraft={selectedGroupDraft}
              handleGroupDraftChange={handleGroupDraftChange}
              handleUnarchiveGroup={handleUnarchiveGroup}
              handleArchiveGroup={handleArchiveGroup}
              handleDeleteGroup={handleDeleteGroup}
              handleSaveGroup={handleSaveGroup}
              savingGroupId={savingGroupId}
              groupAction={groupAction}
            />
          ) : null}

          {!loading && activeTab === 'categories' ? (
            <AdminCategoriesTab
              categories={categories}
              categoryDrafts={categoryDrafts}
              handleCategoryDraftChange={handleCategoryDraftChange}
              handleSaveCategory={handleSaveCategory}
              savingCategoryId={savingCategoryId}
            />
          ) : null}

          {!loading && activeTab === 'activity' ? (
            <AdminActivityTab
              activityFilters={activityFilters}
              handleActivityFilterChange={handleActivityFilterChange}
              users={users}
              groups={groups}
              activityTotal={activityTotal}
              activityLoading={activityLoading}
              activityPage={activityPage}
              setActivityPage={setActivityPage}
              activityLogs={activityLogs}
              expandedActivityId={expandedActivityId}
              setExpandedActivityId={setExpandedActivityId}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
