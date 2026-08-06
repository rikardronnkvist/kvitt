import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Archive, BarChart3, CheckCircle2, Coins, Copy, HandCoins, Link2, Plus, RefreshCw, RotateCcw, SendHorizontal, Settings, Trash2, UserPlus } from 'lucide-react';
import ExpenseItem from '../components/ExpenseItem.jsx';
import EditExpenseModal from '../components/EditExpenseModal.jsx';
import NewExpenseModal from '../components/NewExpenseModal.jsx';
import EditSettlementModal from '../components/EditSettlementModal.jsx';
import NewSettlementModal from '../components/NewSettlementModal.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ModalShell from '../components/ModalShell.jsx';
import InviteQrCodeModal from '../components/InviteQrCodeModal.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { del, get, patch, post } from '../api/client.js';
import { computeMemberBalances } from '../lib/balances.js';
import { getCategoryIcon } from '../lib/expenseCategories.js';
import { formatCurrency, formatDateTime, formatMonthYear } from '../lib/format.js';
import { buildInviteUrl } from '../lib/inviteToken.js';
import { getCurrentUserId } from '../lib/session.js';
import { getUserDisplayName } from '../lib/users.js';
import { GROUP_THEMES, getThemeForGroup } from '../lib/groupTheme.js';

const INITIAL_TIMELINE_VISIBLE_COUNT = 25;
const TIMELINE_LOAD_STEP = 25;

function getMonthKey(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function sanitizeIntegerInput(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function getBalanceAmountClass(balance) {
  if (balance > 0) {
    return 'amount-positive';
  }
  if (balance < 0) {
    return 'amount-negative';
  }
  return 'amount-neutral';
}

function toTimestamp(value, { assumeUtcNaive = false } = {}) {
  if (!value) return Number.NaN;
  const input = String(value).trim();
  const naiveMatch = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(input);
  if (naiveMatch) {
    const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0'] = naiveMatch;
    const year = Number(yearText);
    const month = Number(monthText) - 1;
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    if (assumeUtcNaive) {
      return Date.UTC(year, month, day, hour, minute, second, 0);
    }
    const localDate = new Date(year, month, day, hour, minute, second, 0);
    return Number.isNaN(localDate.getTime()) ? Number.NaN : localDate.getTime();
  }

  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? Number.NaN : parsed.getTime();
}

function GroupSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="skeleton h-4 w-20 rounded-md" />
        <div className="skeleton h-8 w-56 rounded-md" />
        <div className="skeleton h-4 w-72 rounded-md" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="surface-card space-y-5 p-6">
          <div className="skeleton h-5 w-28 rounded-md" />
          {[1, 2, 3].map((item) => (
            <div key={item} className="space-y-3 border-b border-[var(--border-subtle)] pb-5 last:border-b-0 last:pb-0">
              <div className="skeleton h-5 w-40 rounded-md" />
              <div className="skeleton h-4 w-64 rounded-md" />
              <div className="skeleton h-4 w-32 rounded-md" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="surface-card space-y-4 p-5">
            <div className="skeleton h-5 w-32 rounded-md" />
            <div className="skeleton h-24 rounded-md" />
          </div>
          <div className="surface-card space-y-4 p-5">
            <div className="skeleton h-5 w-28 rounded-md" />
            <div className="skeleton h-24 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SettlementItem({ settlement, onEdit, readOnly = false }) {
  const payerUser = {
    full_name: settlement.payer_full_name || settlement.payer_display_name,
    initials: settlement.payer_initials,
    avatar_url: settlement.payer_avatar_url,
  };
  const receiverUser = {
    full_name: settlement.receiver_full_name || settlement.receiver_display_name,
    initials: settlement.receiver_initials,
    avatar_url: settlement.receiver_avatar_url,
  };

  const handleKeyDown = (event) => {
    if (readOnly) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onEdit(settlement.id);
    }
  };

  return (
    <article
      className={[
        'flex flex-col gap-4 border-b border-[var(--border-subtle)] px-5 py-5 transition last:border-b-0 sm:flex-row sm:items-center sm:justify-between',
        readOnly ? '' : 'cursor-pointer hover:bg-[var(--app-surface-muted)] focus:outline-none focus-visible:bg-[var(--app-surface-muted)]',
      ].join(' ')}
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? undefined : 0}
      onClick={readOnly ? undefined : () => onEdit(settlement.id)}
      onKeyDown={readOnly ? undefined : handleKeyDown}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--app-surface-muted)] text-[var(--text-secondary)]">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <h3 className="m-0 flex items-center gap-1.5 text-base font-semibold">
            <HandCoins className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            Kvittat: från {settlement.payer_display_name} till {settlement.receiver_display_name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5">
              <span
                title={settlement.payer_display_name}
                className="inline-flex items-center justify-center px-0.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]"
              >
                  <UserAvatar
                    user={payerUser}
                    className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-[var(--app-surface-strong)] ring-1 ring-black/35"
                    imageClassName="h-full w-full object-cover"
                    initialsClassName="text-[9px] font-semibold text-[var(--text-primary)]"
                  />
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                title={settlement.receiver_display_name}
                className="inline-flex items-center justify-center px-0.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]"
              >
                <UserAvatar
                  user={receiverUser}
                  className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-[var(--app-surface-strong)] ring-1 ring-black/35"
                  imageClassName="h-full w-full object-cover"
                  initialsClassName="text-[9px] font-semibold text-[var(--text-primary)]"
                />
              </span>
            </span>
          </div>
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-[9.5rem_6.5rem] items-center gap-4 self-center text-right">
        <p className="m-0 whitespace-nowrap text-xs tabular-nums text-[var(--text-muted)]">{formatDateTime(settlement.settled_at)}</p>
        <p className="m-0 text-lg font-semibold tabular-nums amount-neutral">{formatCurrency(settlement.amount, { precise: true })}</p>
      </div>
    </article>
  );
}

async function generateInvite({ groupSlug, setInviteLoading, setInviteToken, setInviteExpiresAt, setError }) {
  setInviteLoading(true);
  try {
    const data = await post(`/api/groups/${groupSlug}/invite`, {});
    setInviteToken(data.token);
    setInviteExpiresAt(data.expires_at);
  } catch (err) {
    setError(err.message);
  } finally {
    setInviteLoading(false);
  }
}

async function ensureInviteToken({ inviteToken, inviteExpiresAt, groupSlug, setInviteToken, setInviteExpiresAt }) {
  if (inviteToken) {
    return { token: inviteToken, expiresAt: inviteExpiresAt };
  }
  const data = await post(`/api/groups/${groupSlug}/invite`, {});
  setInviteToken(data.token);
  setInviteExpiresAt(data.expires_at);
  return { token: data.token, expiresAt: data.expires_at };
}

async function revokeInvite({ groupSlug, setInviteToken, setInviteExpiresAt, setError }) {
  if (!window.confirm('Är du säker? Befintlig länk slutar fungera direkt.')) return;
  try {
    await del(`/api/groups/${groupSlug}/invite`);
    setInviteToken(null);
    setInviteExpiresAt(null);
  } catch (err) {
    setError(err.message);
  }
}

async function copyInviteLink({ ensureInvite, setInviteCopied, setError }) {
  try {
    const { token } = await ensureInvite();
    const url = buildInviteUrl(token);
    await navigator.clipboard.writeText(url);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  } catch (err) {
    setError(err.message || 'Kunde inte kopiera inbjudningslänken.');
  }
}

async function shareInvite({ ensureInvite, groupName, setInviteCopied, setInviteSharing, setError }) {
  setInviteSharing(true);
  try {
    const { token } = await ensureInvite();
    const url = buildInviteUrl(token);

    if (navigator.share) {
      await navigator.share({
        title: `Gå med i ${groupName || 'gruppen'}`,
        text: 'Gå med i vår grupp på Kvitt',
        url,
      });
      return;
    }

    await navigator.clipboard.writeText(url);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  } catch (err) {
    if (err?.name !== 'AbortError') {
      setError(err.message || 'Kunde inte dela inbjudan.');
    }
  } finally {
    setInviteSharing(false);
  }
}

async function openInviteQr({ ensureInvite, setIsInviteQrOpen, setError }) {
  try {
    await ensureInvite();
    setIsInviteQrOpen(true);
  } catch (err) {
    setError(err.message || 'Kunde inte skapa QR-kod för inbjudan.');
  }
}

async function addPlaceholderMember({ placeholderName, setAddingPlaceholder, setPlaceholderName, groupSlug, loadData, setError }) {
  const name = placeholderName.trim();
  if (!name) return;
  setAddingPlaceholder(true);
  try {
    await post(`/api/groups/${groupSlug}/members/placeholder`, { display_name: name });
    setPlaceholderName('');
    await loadData({ silent: true });
  } catch (err) {
    setError(err.message);
  } finally {
    setAddingPlaceholder(false);
  }
}

async function removeGroupMember({ isArchived, groupSlug, userId, loadData, setError }) {
  if (isArchived) {
    setError('Gruppen är arkiverad och skrivskyddad.');
    return;
  }
  try {
    await del(`/api/groups/${groupSlug}/members/${userId}`);
    await loadData();
  } catch (deleteError) {
    setError(deleteError.message);
  }
}

async function updateGroupTheme({ isArchived, groupSlug, themeId, setGroup, setError }) {
  if (isArchived) {
    setError('Gruppen är arkiverad och skrivskyddad.');
    return;
  }
  try {
    const updated = await patch(`/api/groups/${groupSlug}`, { theme_color: themeId });
    setGroup((previous) => ({ ...previous, ...updated }));
  } catch (updateError) {
    setError(updateError.message);
  }
}

async function updateGroupMileageRate({ isArchived, mileageRateDraft, groupSlug, setGroup, setMileageRateDraft, setError }) {
  if (isArchived) {
    setError('Gruppen är arkiverad och skrivskyddad.');
    return;
  }
  const parsed = Number(mileageRateDraft);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    setError('Milkostnad måste vara större än 0.');
    return;
  }
  try {
    const updated = await patch(`/api/groups/${groupSlug}`, { mileage_rate: parsed });
    setGroup((previous) => ({ ...previous, ...updated }));
    setMileageRateDraft(String(parsed));
    setError('');
  } catch (updateError) {
    setError(updateError.message);
  }
}

async function renameGroup({ isArchived, groupNameDraft, currentGroupName, groupSlug, slug, navigate, setRenamingGroup, setGroup, setGroupNameDraft, setError }) {
  if (isArchived) {
    setError('Gruppen är arkiverad och skrivskyddad.');
    return;
  }
  const trimmedName = groupNameDraft.trim();
  if (!trimmedName) {
    setError('Gruppnamn måste anges.');
    return;
  }
  if (trimmedName === currentGroupName.trim()) {
    setError('');
    return;
  }
  setRenamingGroup(true);
  try {
    const updated = await patch(`/api/groups/${groupSlug}`, { name: trimmedName });
    setGroup((previous) => ({ ...previous, ...updated }));
    setGroupNameDraft(updated.name || trimmedName);
    setError('');
    if (updated.slug && updated.slug !== slug) {
      navigate(`/groups/${updated.slug}`, { replace: true });
    }
  } catch (renameError) {
    setError(renameError.message);
  } finally {
    setRenamingGroup(false);
  }
}

async function deleteExpenseEntry({ isArchived, expenseId, setExpenses, loadData, setError }) {
  if (isArchived) {
    setError('Gruppen är arkiverad och skrivskyddad.');
    return;
  }
  try {
    setExpenses((previous) => previous.filter((expense) => expense.id !== expenseId));
    setError('');
    await loadData({ silent: true });
  } catch (deleteError) {
    setError(deleteError.message);
  }
}

function saveExpenseEntry({ isArchived, updated, setExpenses, loadData, setError }) {
  if (isArchived) {
    setError('Gruppen är arkiverad och skrivskyddad.');
    return;
  }
  setExpenses((previous) => previous.map((expense) => (expense.id === updated.id ? updated : expense)));
  loadData();
}

function saveSettlementEntry({ isArchived, updated, setSettlements, loadData, setError }) {
  if (isArchived) {
    setError('Gruppen är arkiverad och skrivskyddad.');
    return;
  }
  setSettlements((previous) => previous.map((settlement) => (settlement.id === updated.id ? updated : settlement)));
  loadData();
}

async function deleteSettlementEntry({ isArchived, settlementId, setSettlements, loadData, setError }) {
  if (isArchived) {
    setError('Gruppen är arkiverad och skrivskyddad.');
    return;
  }
  setSettlements((previous) => previous.filter((settlement) => settlement.id !== settlementId));
  setError('');
  await loadData({ silent: true });
}

async function archiveGroup({ canArchiveGroup, groupSlug, setGroup, setIsSettingsOpen, setIsAddingExpense, setIsAddingSettlement, setEditingExpenseId, setEditingSettlementId, setError }) {
  if (!canArchiveGroup) {
    return;
  }
  if (!window.confirm('Är du säker på att du vill arkivera gruppen? Gruppen blir skrivskyddad.')) {
    return;
  }

  try {
    const updated = await post(`/api/groups/${groupSlug}/archive`, {});
    setGroup((previous) => ({ ...previous, ...updated }));
    setIsSettingsOpen(false);
    setIsAddingExpense(false);
    setIsAddingSettlement(false);
    setEditingExpenseId(null);
    setEditingSettlementId(null);
    setError('');
  } catch (archiveError) {
    setError(archiveError.message);
  }
}

async function unarchiveGroup({ isGroupOwner, isArchived, groupActionSaving, groupSlug, setGroupActionSaving, setGroup, setError }) {
  if (!isGroupOwner || !isArchived || groupActionSaving) {
    return;
  }
  if (!window.confirm('Är du säker på att du vill återaktivera gruppen?')) {
    return;
  }

  setGroupActionSaving(true);
  try {
    const updated = await post(`/api/groups/${groupSlug}/unarchive`, {});
    setGroup((previous) => ({ ...previous, ...updated }));
    setError('');
  } catch (unarchiveError) {
    setError(unarchiveError.message);
  } finally {
    setGroupActionSaving(false);
  }
}

async function deleteGroupPermanently({ isGroupOwner, groupActionSaving, groupSlug, navigate, setGroupActionSaving, setError }) {
  if (!isGroupOwner || groupActionSaving) {
    return;
  }
  if (!window.confirm('Är du säker på att du vill radera gruppen permanent? Detta kan inte ångras.')) {
    return;
  }

  setGroupActionSaving(true);
  try {
    await del(`/api/groups/${groupSlug}`);
    navigate('/');
  } catch (deleteError) {
    setError(deleteError.message);
    setGroupActionSaving(false);
  }
}

function GroupActionButtons({
  isArchived,
  isGroupOwner,
  groupSlug,
  theme,
  members,
  groupActionSaving,
  onAddExpense,
  onAddSettlement,
  onOpenSettings,
  onUnarchive,
  onDeleteGroup,
  navigate,
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {!isArchived ? (
        <button type="button" className="btn-primary" style={{ background: theme.base, borderColor: theme.base }} onClick={onAddExpense} disabled={members.length < 2}>
          <Plus className="h-4 w-4" />
          Lägg till utgift
        </button>
      ) : null}
      {!isArchived ? (
        <button type="button" className="btn-secondary" onClick={onAddSettlement}>
          <HandCoins className="h-4 w-4" />
          Kvitta skuld
        </button>
      ) : null}
      <button type="button" className="btn-secondary" onClick={() => navigate(`/groups/${groupSlug}/statistics`)}>
        <BarChart3 className="h-4 w-4" />
        Statistik
      </button>
      {isGroupOwner && !isArchived ? (
        <button type="button" className="btn-secondary" onClick={onOpenSettings}>
          <Settings className="h-4 w-4" />
          Inställningar
        </button>
      ) : null}
      {isGroupOwner && isArchived ? (
        <button type="button" className="btn-secondary" onClick={onUnarchive} disabled={groupActionSaving}>
          <RotateCcw className="h-4 w-4" />
          Återaktivera
        </button>
      ) : null}
      {isGroupOwner && isArchived ? (
        <button type="button" className="btn-danger" onClick={onDeleteGroup} disabled={groupActionSaving}>
          <Trash2 className="h-4 w-4" />
          Radera grupp
        </button>
      ) : null}
    </div>
  );
}

function buildTimelineElements({ visibleTimeline, monthlyTotals, theme, isArchived, setEditingExpenseId, setEditingSettlementId }) {
  let currentMonthKey = null;
  return visibleTimeline.flatMap((item) => {
    const monthKey = Number.isFinite(item.activityTimestamp) ? getMonthKey(item.activityTimestamp) : null;
    const result = [];
    if (monthKey && monthKey !== currentMonthKey) {
      currentMonthKey = monthKey;
      const totals = monthlyTotals.get(monthKey) || { totalSpent: 0, expenseCount: 0, settlementTotal: 0, settlementCount: 0 };
      const parts = [];
      if (totals.expenseCount > 0) parts.push(`${totals.expenseCount} ${totals.expenseCount === 1 ? 'utgift' : 'utgifter'}, totalt ${formatCurrency(totals.totalSpent, { precise: true })}`);
      if (totals.settlementCount > 0) parts.push(`${totals.settlementCount} ${totals.settlementCount === 1 ? 'kvittning' : 'kvittningar'}, totalt ${formatCurrency(totals.settlementTotal, { precise: true })}`);
      result.push(
        <div key={`month-${monthKey}`} className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--app-surface-muted)] px-5 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{formatMonthYear(new Date(item.activityTimestamp))}</span>
          <span className="flex flex-col text-right text-xs font-medium sm:block" style={{ color: theme.base }}>
            {parts.map((part, index) => (
              <span key={`${monthKey}-${part}`} className={index > 0 ? 'sm:before:content-["_·_"]' : ''}>{part}</span>
            ))}
          </span>
        </div>,
      );
    }
    result.push(
      item.kind === 'expense' ? (
        <ExpenseItem key={`expense-${item.id}`} expense={item} onEdit={setEditingExpenseId} readOnly={isArchived} />
      ) : (
        <SettlementItem key={`settlement-${item.id}`} settlement={item} onEdit={setEditingSettlementId} readOnly={isArchived} />
      ),
    );
    return result;
  });
}

function TimelineSection({ timeline, visibleTimeline, monthlyTotals, theme, isArchived, setEditingExpenseId, setEditingSettlementId, hasMoreTimeline, setVisibleTimelineCount }) {
  if (!timeline.length) {
    return (
      <section className="surface-card overflow-hidden">
        <div className="p-5">
          <EmptyState
            icon={Coins}
            title="Ingen aktivitet ännu"
            description="Lägg till medlemmar i gruppen och börja sedan att registrera utgifter..."
          />
        </div>
      </section>
    );
  }

  return (
    <section className="surface-card overflow-hidden">
      <div>
        {buildTimelineElements({
          visibleTimeline,
          monthlyTotals,
          theme,
          isArchived,
          setEditingExpenseId,
          setEditingSettlementId,
        })}
        {hasMoreTimeline ? (
          <div className="flex justify-center border-t border-[var(--border-subtle)] px-5 py-4">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setVisibleTimelineCount((previous) => previous + TIMELINE_LOAD_STEP)}
            >
              Ladda fler händelser
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function GroupSettingsModal({
  isSettingsOpen,
  isGroupOwner,
  isArchived,
  onClose,
  groupNameDraft,
  setGroupNameDraft,
  handleRenameGroup,
  renamingGroup,
  group,
  handleUpdateTheme,
  mileageRateDraft,
  setMileageRateDraft,
  handleUpdateMileageRate,
  inviteToken,
  inviteUrl,
  handleShareInvite,
  inviteSharing,
  handleCopyInviteLink,
  inviteCopied,
  inviteExpiresAt,
  handleOpenInviteQr,
  handleGenerateInvite,
  inviteLoading,
  handleRevokeInvite,
  members,
  handleRemoveMember,
  placeholderName,
  setPlaceholderName,
  handleAddPlaceholder,
  addingPlaceholder,
  canArchiveGroup,
  handleArchiveGroup,
}) {
  if (!isSettingsOpen || !isGroupOwner) {
    return null;
  }

  const renderMemberAction = (member) => {
    const isOwner = Number(member.id) === Number(group?.created_by);
    if (isOwner) {
      return (
        <span className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border-subtle)] px-4 text-sm font-medium text-[var(--text-secondary)]">
          Ägare
        </span>
      );
    }

    if (member.has_activity) {
      return (
        <span className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border-subtle)] px-4 text-sm font-medium text-[var(--text-secondary)]" title="Har utgifter eller kvittningar i gruppen">
          Har transaktioner
        </span>
      );
    }

    return (
      <button type="button" className="btn-danger" onClick={() => handleRemoveMember(member.id)} disabled={isArchived}>
        Ta bort
      </button>
    );
  };

  return (
    <ModalShell
      title="Gruppinställningar"
      description={isArchived ? 'Gruppen är arkiverad och skrivskyddad.' : null}
      onClose={onClose}
    >
      <div className="divide-y divide-[var(--border-subtle)]">
        <div className="space-y-4 pb-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Inställningar</h3>
          <div className="space-y-3">
            <label className="field-label">
                <span>Gruppnamn</span>
              <input
                type="text"
                value={groupNameDraft}
                onChange={(event) => setGroupNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleRenameGroup();
                  }
                }}
                disabled={isArchived || renamingGroup}
              />
            </label>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleRenameGroup}
              disabled={isArchived || renamingGroup || !groupNameDraft.trim() || groupNameDraft.trim() === (group?.name || '').trim()}
            >
              Byt gruppnamn
            </button>
          </div>
          <div className="space-y-3">
            <p className="field-label">Färgtema</p>
            <div className="flex flex-wrap gap-2">
              {GROUP_THEMES.map((themeOption) => {
                const isActive = (group?.theme_color ?? null) === themeOption.id
                  || (!group?.theme_color && getThemeForGroup(group).id === themeOption.id);
                return (
                  <button
                    key={themeOption.id}
                    type="button"
                    title={themeOption.name}
                    onClick={() => handleUpdateTheme(themeOption.id)}
                    disabled={isArchived}
                    className="h-7 w-7 rounded-full transition hover:scale-110 focus:outline-none focus-visible:ring-2"
                    style={{
                      background: themeOption.base,
                      outline: isActive ? `2px solid ${themeOption.base}` : undefined,
                      outlineOffset: isActive ? '2px' : undefined,
                      boxShadow: isActive ? `0 0 0 3px rgba(255,255,255,0.9), 0 0 0 5px ${themeOption.base}` : undefined,
                    }}
                    aria-pressed={isActive}
                    aria-label={themeOption.name}
                  />
                );
              })}
            </div>
          </div>
          <div className="space-y-3">
            <label className="field-label">
                <span>Milkostnad för Bil (kr/mil)</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={mileageRateDraft}
                onChange={(event) => setMileageRateDraft(sanitizeIntegerInput(event.target.value))}
                disabled={isArchived}
              />
            </label>
            <button type="button" className="btn-secondary" onClick={handleUpdateMileageRate} disabled={isArchived}>
              Spara milkostnad
            </button>
          </div>
        </div>

        <div className="space-y-4 py-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Inbjudningslänk</h3>
          {inviteToken ? (
            <>
              <div className="flex flex-wrap gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  className="min-w-[220px] flex-1 truncate text-sm"
                />
                <button type="button" className="btn-secondary shrink-0" onClick={handleShareInvite} disabled={inviteSharing}>
                  <SendHorizontal className="h-4 w-4" />
                  {inviteSharing ? 'Delar...' : 'Dela'}
                </button>
                <button type="button" className="btn-secondary shrink-0" onClick={handleCopyInviteLink}>
                  <Copy className="h-4 w-4" />
                  {inviteCopied ? 'Kopierad!' : 'Kopiera'}
                </button>
              </div>
              {inviteExpiresAt && (
                <p className="m-0 text-xs text-[var(--text-muted)]">
                  Gäller till {new Date(inviteExpiresAt).toLocaleDateString('sv-SE')}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={handleOpenInviteQr}>
                  <Link2 className="h-4 w-4" />
                  Visa QR
                </button>
                <button type="button" className="btn-secondary" onClick={handleGenerateInvite} disabled={inviteLoading}>
                  <RefreshCw className="h-4 w-4" />
                  Ny länk
                </button>
                <button type="button" className="btn-danger" onClick={handleRevokeInvite}>
                  Ta bort länk
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="m-0 text-sm text-[var(--text-secondary)]">
                Skapa en länk att dela. Alla med länken kan gå med i gruppen. Länken gäller i 30 dagar.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={handleGenerateInvite} disabled={inviteLoading || isArchived}>
                  <Link2 className="h-4 w-4" />
                  Skapa inbjudningslänk
                </button>
                <button type="button" className="btn-secondary" onClick={handleShareInvite} disabled={inviteSharing || inviteLoading || isArchived}>
                  <SendHorizontal className="h-4 w-4" />
                  {inviteSharing ? 'Delar...' : 'Skapa och dela'}
                </button>
                <button type="button" className="btn-secondary" onClick={handleOpenInviteQr} disabled={inviteLoading || isArchived}>
                  <Link2 className="h-4 w-4" />
                  Skapa och visa QR
                </button>
              </div>
            </>
          )}
        </div>

        <div className="space-y-4 pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Medlemmar</h3>
          <div className="space-y-2">
            {members.map((member) => (
              <div key={member.id} className="flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="m-0 text-sm font-medium">{getUserDisplayName(member)}</p>
                  {member.is_placeholder ? (
                    <p className="m-0 text-xs text-[var(--text-muted)]">Ej ansluten</p>
                  ) : null}
                </div>
                {renderMemberAction(member)}
              </div>
            ))}
          </div>

          {!isArchived && (
            <div className="space-y-3">
              <p className="field-label">Lägg till person i förväg</p>
              <p className="m-0 text-sm text-[var(--text-secondary)]">
                Lägg till namn på personer som ännu inte har skapat konto - du kan dela kostnader med dem direkt.
              </p>
              <div className="flex gap-2">
                <input
                  value={placeholderName}
                  onChange={(event) => setPlaceholderName(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleAddPlaceholder()}
                  placeholder="Fullständigt namn"
                  disabled={addingPlaceholder}
                  className="flex-1"
                />
                <button
                  type="button"
                  className="btn-primary shrink-0"
                  onClick={handleAddPlaceholder}
                  disabled={!placeholderName.trim() || addingPlaceholder}
                >
                  <UserPlus className="h-4 w-4" />
                  Lägg till
                </button>
              </div>
            </div>
          )}

          {isGroupOwner && !isArchived ? (
            <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
              <p className="m-0 text-sm text-[var(--text-secondary)]">
                Arkivera gruppen för att göra den skrivskyddad.
                {!canArchiveGroup && ' Alla medlemmar måste ha balans 0 innan du kan arkivera.'}
              </p>
              <button type="button" className="btn-danger" onClick={handleArchiveGroup} disabled={!canArchiveGroup}>
                <Archive className="h-4 w-4" />
                Arkivera grupp
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}

export default function GroupView() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const currentUserId = useMemo(() => getCurrentUserId(), []);
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [balances, setBalances] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [inviteToken, setInviteToken] = useState(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSharing, setInviteSharing] = useState(false);
  const [isInviteQrOpen, setIsInviteQrOpen] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [placeholderName, setPlaceholderName] = useState('');
  const [addingPlaceholder, setAddingPlaceholder] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [renamingGroup, setRenamingGroup] = useState(false);
  const [mileageRateDraft, setMileageRateDraft] = useState('20');
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editingSettlementId, setEditingSettlementId] = useState(null);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [isAddingSettlement, setIsAddingSettlement] = useState(false);
  const [visibleTimelineCount, setVisibleTimelineCount] = useState(INITIAL_TIMELINE_VISIBLE_COUNT);
  const [groupActionSaving, setGroupActionSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const lastActivityRef = useRef(null);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const groupData = await get(`/api/groups/${slug}`);
      const [expensesData, categoriesData, balancesData, settlementsData] = await Promise.all([
        get(`/api/expenses/${groupData.id}`),
        get('/api/expenses/categories'),
        get(`/api/settlements/${groupData.id}/balances`),
        get(`/api/settlements/${groupData.id}`),
      ]);
      setGroup(groupData);
      setExpenses(expensesData);
      setExpenseCategories(categoriesData);
      setBalances(balancesData);
      setSettlements(settlementsData);
      lastActivityRef.current = groupData.last_activity_at ?? null;
      setError('');
    } catch (loadError) {
      if (!silent) setError(loadError.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Poll for new activity while the tab is visible — avoids requiring a manual reload
  useEffect(() => {
    const POLL_INTERVAL = 20_000;
    let timerId = null;

    const checkAndRefresh = async () => {
      if (document.hidden) return;
      try {
        const { last_activity_at } = await get(`/api/groups/${slug}/activity`);
        if (lastActivityRef.current !== null && last_activity_at !== lastActivityRef.current) {
          await loadData({ silent: true });
        }
      } catch {
        // ignore poll errors
      }
    };

    const schedule = () => {
      timerId = window.setTimeout(async () => {
        await checkAndRefresh();
        schedule();
      }, POLL_INTERVAL);
    };

    const onVisibilityChange = () => { checkAndRefresh(); };

    schedule();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearTimeout(timerId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadData, slug]);

  useEffect(() => {
    if (!group) return;
    setGroupNameDraft(group.name || '');
    setMileageRateDraft(String(Number(group.mileage_rate) > 0 ? Number(group.mileage_rate) : 20));
  }, [group]);

  useEffect(() => {
    if (!group?.name) return undefined;
    document.title = `Kvitt | ${group.name}`;
    return () => {
      document.title = 'Kvitt';
    };
  }, [group?.name]);

  const members = group?.members ?? [];
  const groupId = Number(group?.id);
  const groupSlug = group?.slug || slug;
  const isGroupOwner = Number(group?.created_by) === Number(currentUserId);
  const isArchived = Boolean(group?.archived_at);
  const theme = getThemeForGroup(group);
  const mileageRate = Number(group?.mileage_rate) > 0 ? Number(group.mileage_rate) : 20;
  const editingExpense = expenses.find((expense) => expense.id === editingExpenseId);
  const editingSettlement = settlements.find((settlement) => settlement.id === editingSettlementId);

  useEffect(() => {
    if (!isSettingsOpen || !isGroupOwner || !groupSlug) return;
    let active = true;
    get(`/api/groups/${groupSlug}/invite`)
      .then((data) => {
        if (!active) return;
        setInviteToken(data.token);
        setInviteExpiresAt(data.expires_at);
      })
      .catch(() => {
        if (!active) return;
        setInviteToken(null);
        setInviteExpiresAt(null);
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettingsOpen, groupSlug]);

  const timeline = useMemo(() => {
    return [
      ...expenses.map((expense) => ({
        ...expense,
        kind: 'expense',
        activityDate: expense.occurred_at || expense.created_at,
        activityTimestamp: toTimestamp(expense.occurred_at || expense.created_at),
        tieBreakerTimestamp: toTimestamp(expense.created_at || expense.occurred_at, { assumeUtcNaive: true }),
      })),
      ...settlements.map((settlement) => ({
        ...settlement,
        kind: 'settlement',
        activityDate: settlement.settled_at,
        activityTimestamp: toTimestamp(settlement.settled_at),
        tieBreakerTimestamp: toTimestamp(settlement.settled_at),
        payer_display_name: getUserDisplayName({ full_name: settlement.payer_full_name }),
        receiver_display_name: getUserDisplayName({ full_name: settlement.receiver_full_name }),
      })),
    ].sort((a, b) => {
      const activityMinuteA = Math.floor(a.activityTimestamp / 60000);
      const activityMinuteB = Math.floor(b.activityTimestamp / 60000);
      if (
        Number.isFinite(activityMinuteA)
        && Number.isFinite(activityMinuteB)
        && activityMinuteB !== activityMinuteA
      ) {
        return activityMinuteB - activityMinuteA;
      }

      const tieBreakerA = a.tieBreakerTimestamp;
      const tieBreakerB = b.tieBreakerTimestamp;
      if (Number.isFinite(tieBreakerA) && Number.isFinite(tieBreakerB) && tieBreakerB !== tieBreakerA) {
        return tieBreakerB - tieBreakerA;
      }

      return Number(b.id) - Number(a.id);
    });
  }, [expenses, settlements]);

  useEffect(() => {
    setVisibleTimelineCount(INITIAL_TIMELINE_VISIBLE_COUNT);
  }, [slug, timeline.length]);

  const visibleTimeline = useMemo(
    () => timeline.slice(0, visibleTimelineCount),
    [timeline, visibleTimelineCount],
  );
  const hasMoreTimeline = timeline.length > visibleTimelineCount;

  const monthlyTotals = useMemo(() => {
    const map = new Map();
    for (const item of timeline) {
      if (!Number.isFinite(item.activityTimestamp)) continue;
      const key = getMonthKey(item.activityTimestamp);
      const current = map.get(key) || { totalSpent: 0, expenseCount: 0, settlementTotal: 0, settlementCount: 0 };
      if (item.kind === 'expense') {
        current.totalSpent += Number(item.amount || 0);
        current.expenseCount += 1;
      } else {
        current.settlementTotal += Number(item.amount || 0);
        current.settlementCount += 1;
      }
      map.set(key, current);
    }
    return map;
  }, [timeline]);

  const memberBalances = useMemo(
    () => computeMemberBalances(members, expenses, settlements),
    [members, expenses, settlements],
  );
  const memberBalancesAscending = useMemo(
    () => [...memberBalances].sort((a, b) => Number(a.balance) - Number(b.balance)),
    [memberBalances],
  );
  const canArchiveGroup = isGroupOwner && !isArchived && memberBalances.every((member) => Number(member.balance) === 0);
  const inviteUrl = useMemo(() => {
    if (!inviteToken) return '';
    try {
      return buildInviteUrl(inviteToken);
    } catch {
      return '';
    }
  }, [inviteToken]);

  const summary = useMemo(() => {
    const normalizeIconId = (value) => String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, '-');

    const sortOrderByIcon = new Map(
      expenseCategories.map((category) => [normalizeIconId(category.icon), Number(category.sort_order)]),
    );
    const sortOrderByName = new Map(
      expenseCategories.map((category) => [String(category.name || '').trim().toLowerCase(), Number(category.sort_order)]),
    );

    const totals = new Map();
    for (const expense of expenses) {
      const key = `${expense.category_name || 'Övrigt'}|${expense.category_icon || 'shapes'}`;
      const current = totals.get(key) || { name: expense.category_name || 'Övrigt', icon: expense.category_icon || 'shapes', amount: 0 };
      current.amount += Number(expense.amount || 0);
      totals.set(key, current);
    }

    return {
      totalExpenses: expenses.reduce((sum, expense) => sum + expense.amount, 0),
      byCategory: Array.from(totals.values()).sort((a, b) => {
        const orderA = sortOrderByIcon.get(normalizeIconId(a.icon))
          ?? sortOrderByName.get(String(a.name || '').trim().toLowerCase())
          ?? Number.MAX_SAFE_INTEGER;
        const orderB = sortOrderByIcon.get(normalizeIconId(b.icon))
          ?? sortOrderByName.get(String(b.name || '').trim().toLowerCase())
          ?? Number.MAX_SAFE_INTEGER;

        if (orderA !== orderB) {
          return orderA - orderB;
        }

        return b.amount - a.amount;
      }),
    };
  }, [expenses, expenseCategories]);

  const ensureInvite = () => ensureInviteToken({
    inviteToken,
    inviteExpiresAt,
    groupSlug,
    setInviteToken,
    setInviteExpiresAt,
  });

  const handleGenerateInvite = () => generateInvite({
    groupSlug,
    setInviteLoading,
    setInviteToken,
    setInviteExpiresAt,
    setError,
  });

  const handleRevokeInvite = () => revokeInvite({
    groupSlug,
    setInviteToken,
    setInviteExpiresAt,
    setError,
  });

  const handleCopyInviteLink = () => copyInviteLink({ ensureInvite, setInviteCopied, setError });
  const handleShareInvite = () => shareInvite({
    ensureInvite,
    groupName: group?.name,
    setInviteCopied,
    setInviteSharing,
    setError,
  });
  const handleOpenInviteQr = () => openInviteQr({ ensureInvite, setIsInviteQrOpen, setError });

  const handleAddPlaceholder = () => addPlaceholderMember({
    placeholderName,
    setAddingPlaceholder,
    setPlaceholderName,
    groupSlug,
    loadData,
    setError,
  });

  const handleRemoveMember = (userId) => removeGroupMember({
    isArchived,
    groupSlug,
    userId,
    loadData,
    setError,
  });

  const handleUpdateTheme = (themeId) => updateGroupTheme({
    isArchived,
    groupSlug,
    themeId,
    setGroup,
    setError,
  });

  const handleUpdateMileageRate = () => updateGroupMileageRate({
    isArchived,
    mileageRateDraft,
    groupSlug,
    setGroup,
    setMileageRateDraft,
    setError,
  });

  const handleRenameGroup = () => renameGroup({
    isArchived,
    groupNameDraft,
    currentGroupName: group?.name || '',
    groupSlug,
    slug,
    navigate,
    setRenamingGroup,
    setGroup,
    setGroupNameDraft,
    setError,
  });

  const handleDeleteExpense = (expenseId) => deleteExpenseEntry({
    isArchived,
    expenseId,
    setExpenses,
    loadData,
    setError,
  });

  const handleSaveExpense = (updated) => saveExpenseEntry({
    isArchived,
    updated,
    setExpenses,
    loadData,
    setError,
  });

  const handleSaveSettlement = (updated) => saveSettlementEntry({
    isArchived,
    updated,
    setSettlements,
    loadData,
    setError,
  });

  const handleDeleteSettlement = (settlementId) => deleteSettlementEntry({
    isArchived,
    settlementId,
    setSettlements,
    loadData,
    setError,
  });

  const handleArchiveGroup = () => archiveGroup({
    canArchiveGroup,
    groupSlug,
    setGroup,
    setIsSettingsOpen,
    setIsAddingExpense,
    setIsAddingSettlement,
    setEditingExpenseId,
    setEditingSettlementId,
    setError,
  });

  const handleUnarchiveGroup = () => unarchiveGroup({
    isGroupOwner,
    isArchived,
    groupActionSaving,
    groupSlug,
    setGroupActionSaving,
    setGroup,
    setError,
  });

  const handleDeleteGroup = () => deleteGroupPermanently({
    isGroupOwner,
    groupActionSaving,
    groupSlug,
    navigate,
    setGroupActionSaving,
    setError,
  });

  if (loading) {
    return <GroupSkeleton />;
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="surface-card overflow-hidden space-y-6 p-0">
          <div
            className="h-1.5 w-full"
            style={{ background: theme.base }}
          />
          <div className="space-y-6 px-6 pb-6 sm:px-7 sm:pb-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <h1 className="page-title">{group?.name}</h1>
              </div>
              <GroupActionButtons
                isArchived={isArchived}
                isGroupOwner={isGroupOwner}
                groupSlug={groupSlug}
                theme={theme}
                members={members}
                groupActionSaving={groupActionSaving}
                onAddExpense={() => setIsAddingExpense(true)}
                onAddSettlement={() => setIsAddingSettlement(true)}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onUnarchive={handleUnarchiveGroup}
                onDeleteGroup={handleDeleteGroup}
                navigate={navigate}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <article className="rounded-lg border p-4" style={{ background: theme.bgSoft, borderColor: theme.borderSoft }}>
                <p className="section-eyebrow">Balans</p>
                <div className="mt-2 space-y-0.5">
                  {memberBalancesAscending.map((member) => {
                    const isCurrentUser = Number(member.id) === Number(currentUserId);
                    const shouldEmphasizeCurrentUser = memberBalancesAscending.length > 3 && isCurrentUser;
                    return (
                      <div
                        key={member.id}
                        className={`flex items-center justify-between gap-3 rounded-md px-1.5 py-0.5 text-sm ${shouldEmphasizeCurrentUser ? 'bg-[color:color-mix(in_srgb,var(--app-surface-strong)_40%,transparent)]' : ''}`}
                      >
                        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 font-medium">
                        <UserAvatar
                          user={member}
                          className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-[var(--app-surface-strong)] ring-1 ring-black/35"
                          imageClassName="h-full w-full object-cover"
                          initialsClassName="text-[9px] font-semibold text-[var(--text-secondary)]"
                        />
                          <span className="truncate">{getUserDisplayName(member)}</span>
                        </span>
                        <span className={`shrink-0 tabular-nums font-semibold ${getBalanceAmountClass(member.balance)}`}>
                          {member.balance < 0 ? '-' : ''}
                          {formatCurrency(Math.abs(member.balance), { precise: true })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </article>
              <article className="rounded-lg border p-4" style={{ background: theme.bgSoft, borderColor: theme.borderSoft }}>
                <div className="mt-2 space-y-1.5">
                  {summary.byCategory.map((category) => {
                    const CategoryIcon = getCategoryIcon(category.icon);
                    return (
                      <div key={`${category.name}-${category.icon}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="inline-flex items-center gap-1.5 text-[var(--text-primary)]">
                          <CategoryIcon className="h-4 w-4" />
                          {category.name}
                        </span>
                        <span className="font-semibold amount-neutral">{formatCurrency(category.amount, { precise: true })}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t pt-2" style={{ borderColor: theme.borderSoft }}>
                  <span className="text-sm text-[var(--text-secondary)]">Totalt</span>
                  <span className="m-0 text-lg font-semibold amount-neutral">{formatCurrency(summary.totalExpenses, { precise: true })}</span>
                </div>
              </article>
            </div>
            {isArchived ? (
              <p className="m-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                Gruppen är arkiverad och skrivskyddad.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="grid gap-6">
        <TimelineSection
          timeline={timeline}
          visibleTimeline={visibleTimeline}
          monthlyTotals={monthlyTotals}
          theme={theme}
          isArchived={isArchived}
          setEditingExpenseId={setEditingExpenseId}
          setEditingSettlementId={setEditingSettlementId}
          hasMoreTimeline={hasMoreTimeline}
          setVisibleTimelineCount={setVisibleTimelineCount}
        />
      </div>

      <GroupSettingsModal
        isSettingsOpen={isSettingsOpen}
        isGroupOwner={isGroupOwner}
        isArchived={isArchived}
        onClose={() => setIsSettingsOpen(false)}
        groupNameDraft={groupNameDraft}
        setGroupNameDraft={setGroupNameDraft}
        handleRenameGroup={handleRenameGroup}
        renamingGroup={renamingGroup}
        group={group}
        handleUpdateTheme={handleUpdateTheme}
        mileageRateDraft={mileageRateDraft}
        setMileageRateDraft={setMileageRateDraft}
        handleUpdateMileageRate={handleUpdateMileageRate}
        inviteToken={inviteToken}
        inviteUrl={inviteUrl}
        handleShareInvite={handleShareInvite}
        inviteSharing={inviteSharing}
        handleCopyInviteLink={handleCopyInviteLink}
        inviteCopied={inviteCopied}
        inviteExpiresAt={inviteExpiresAt}
        handleOpenInviteQr={handleOpenInviteQr}
        handleGenerateInvite={handleGenerateInvite}
        inviteLoading={inviteLoading}
        handleRevokeInvite={handleRevokeInvite}
        members={members}
        handleRemoveMember={handleRemoveMember}
        placeholderName={placeholderName}
        setPlaceholderName={setPlaceholderName}
        handleAddPlaceholder={handleAddPlaceholder}
        addingPlaceholder={addingPlaceholder}
        canArchiveGroup={canArchiveGroup}
        handleArchiveGroup={handleArchiveGroup}
      />

      {editingExpense && !isArchived ? (
        <EditExpenseModal
          expense={editingExpense}
          members={members}
          categories={expenseCategories}
          mileageRate={mileageRate}
          groupId={groupId}
          onClose={() => setEditingExpenseId(null)}
          onSave={handleSaveExpense}
          onDelete={handleDeleteExpense}
        />
      ) : null}

      {editingSettlement && !isArchived ? (
        <EditSettlementModal
          settlement={editingSettlement}
          members={members}
          groupId={groupId}
          onClose={() => setEditingSettlementId(null)}
          onSave={handleSaveSettlement}
          onDelete={handleDeleteSettlement}
        />
      ) : null}

      {isAddingExpense && !isArchived ? (
        <NewExpenseModal
          groupId={groupId}
          members={members}
          categories={expenseCategories}
          mileageRate={mileageRate}
          onClose={() => setIsAddingExpense(false)}
          onSuccess={loadData}
        />
      ) : null}

      {isAddingSettlement && !isArchived ? (
        <NewSettlementModal
          groupId={groupId}
          groupName={group?.name}
          members={members}
          balances={balances}
          currentUserId={currentUserId}
          onClose={() => setIsAddingSettlement(false)}
          onSuccess={loadData}
        />
      ) : null}

      {isInviteQrOpen && inviteUrl ? (
        <InviteQrCodeModal
          inviteUrl={inviteUrl}
          expiresAt={inviteExpiresAt}
          sharing={inviteSharing}
          onClose={() => setIsInviteQrOpen(false)}
          onShare={handleShareInvite}
          onCopy={handleCopyInviteLink}
        />
      ) : null}
    </div>
  );
}
