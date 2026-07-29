import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Coins, Settings, UserPlus } from 'lucide-react';
import ExpenseItem from '../components/ExpenseItem.jsx';
import EditExpenseModal from '../components/EditExpenseModal.jsx';
import NewExpenseModal from '../components/NewExpenseModal.jsx';
import EditSettlementModal from '../components/EditSettlementModal.jsx';
import NewSettlementModal from '../components/NewSettlementModal.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ModalShell from '../components/ModalShell.jsx';
import { del, get, patch, post } from '../api/client.js';
import { computeMemberBalances } from '../lib/balances.js';
import { getCategoryIcon } from '../lib/expenseCategories.js';
import { formatCurrency, formatDateTime } from '../lib/format.js';
import { getCurrentUserId } from '../lib/session.js';
import { getUserDisplayName, getUserSearchLabel } from '../lib/users.js';
import { GROUP_THEMES, getThemeForGroup } from '../lib/groupTheme.js';

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

function SettlementItem({ settlement, onEdit }) {
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onEdit(settlement.id);
    }
  };

  return (
    <article
      className="flex cursor-pointer flex-col gap-4 border-b border-[var(--border-subtle)] px-5 py-5 transition hover:bg-[var(--app-surface-muted)] focus:outline-none focus-visible:bg-[var(--app-surface-muted)] last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
      role="button"
      tabIndex={0}
      onClick={() => onEdit(settlement.id)}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--app-surface-muted)] text-[var(--text-secondary)]">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <h3 className="m-0 text-base font-semibold">{settlement.payer_display_name} betalade {settlement.receiver_display_name}</h3>
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-[9.5rem_6.5rem] items-center gap-4 self-center text-right">
        <p className="m-0 whitespace-nowrap text-xs tabular-nums text-[var(--text-muted)]">{formatDateTime(settlement.settled_at)}</p>
        <p className="m-0 text-lg font-semibold tabular-nums amount-neutral">{formatCurrency(settlement.amount, { precise: true })}</p>
      </div>
    </article>
  );
}

export default function GroupView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUserId = useMemo(() => getCurrentUserId(), []);
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [balances, setBalances] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mileageRateDraft, setMileageRateDraft] = useState('20');
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editingSettlementId, setEditingSettlementId] = useState(null);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [isAddingSettlement, setIsAddingSettlement] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [groupData, expensesData, categoriesData, balancesData, settlementsData] = await Promise.all([
        get(`/api/groups/${id}`),
        get(`/api/expenses/${id}`),
        get('/api/expenses/categories'),
        get(`/api/settlements/${id}/balances`),
        get(`/api/settlements/${id}`),
      ]);
      setGroup(groupData);
      setExpenses(expensesData);
      setExpenseCategories(categoriesData);
      setBalances(balancesData);
      setSettlements(settlementsData);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!group) return;
    setMileageRateDraft(String(Number(group.mileage_rate) > 0 ? Number(group.mileage_rate) : 20));
  }, [group]);

  const members = group?.members ?? [];
  const isGroupOwner = Number(group?.created_by) === Number(currentUserId);
  const theme = getThemeForGroup(group);
  const mileageRate = Number(group?.mileage_rate) > 0 ? Number(group.mileage_rate) : 20;
  const editingExpense = expenses.find((expense) => expense.id === editingExpenseId);
  const editingSettlement = settlements.find((settlement) => settlement.id === editingSettlementId);

  useEffect(() => {
    if (!isSettingsOpen) {
      setMemberSearchQuery('');
      setMemberSearchResults([]);
      setSearchingMembers(false);
      return undefined;
    }

    const query = memberSearchQuery.trim();
    if (!query) {
      setMemberSearchResults([]);
      setSearchingMembers(false);
      return undefined;
    }

    let active = true;
    setSearchingMembers(true);
    const timer = window.setTimeout(async () => {
      try {
        const results = await get(`/api/groups/${id}/member-search?query=${encodeURIComponent(query)}`);
        if (active) {
          setMemberSearchResults(results);
        }
      } catch (searchError) {
        if (active) {
          setError(searchError.message);
          setMemberSearchResults([]);
        }
      } finally {
        if (active) {
          setSearchingMembers(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [id, isSettingsOpen, memberSearchQuery]);

  const timeline = useMemo(() => {
    return [
      ...expenses.map((expense) => ({ ...expense, kind: 'expense', activityDate: expense.occurred_at || expense.created_at })),
      ...settlements.map((settlement) => ({
        ...settlement,
        kind: 'settlement',
        activityDate: settlement.settled_at,
        payer_display_name: getUserDisplayName({ full_name: settlement.payer_full_name, username: settlement.payer_username }),
        receiver_display_name: getUserDisplayName({ full_name: settlement.receiver_full_name, username: settlement.receiver_username }),
      })),
    ].sort((a, b) => new Date(b.activityDate) - new Date(a.activityDate));
  }, [expenses, settlements]);

  const memberBalances = useMemo(
    () => computeMemberBalances(members, expenses, settlements),
    [members, expenses, settlements],
  );

  const summary = useMemo(() => {
    const totals = new Map();
    for (const expense of expenses) {
      const key = `${expense.category_name || 'Övrigt'}|${expense.category_icon || 'shapes'}`;
      const current = totals.get(key) || { name: expense.category_name || 'Övrigt', icon: expense.category_icon || 'shapes', amount: 0 };
      current.amount += Number(expense.amount || 0);
      totals.set(key, current);
    }

    return {
      totalExpenses: expenses.reduce((sum, expense) => sum + expense.amount, 0),
      byCategory: Array.from(totals.values()).sort((a, b) => b.amount - a.amount),
    };
  }, [expenses]);

  const handleAddMember = async (userId) => {
    try {
      await post(`/api/groups/${id}/members`, { user_id: userId });
      setMemberSearchQuery('');
      setMemberSearchResults([]);
      await loadData();
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  const handleRemoveMember = async (userId) => {
    try {
      await del(`/api/groups/${id}/members/${userId}`);
      await loadData();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const handleUpdateTheme = async (themeId) => {
    try {
      const updated = await patch(`/api/groups/${id}`, { theme_color: themeId });
      setGroup((previous) => ({ ...previous, ...updated }));
    } catch (updateError) {
      setError(updateError.message);
    }
  };

  const handleUpdateMileageRate = async () => {
    const parsed = Number(mileageRateDraft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Milkostnad måste vara större än 0.');
      return;
    }
    try {
      const updated = await patch(`/api/groups/${id}`, { mileage_rate: parsed });
      setGroup((previous) => ({ ...previous, ...updated }));
      setMileageRateDraft(String(parsed));
      setError('');
    } catch (updateError) {
      setError(updateError.message);
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    try {
      await del(`/api/expenses/${id}/${expenseId}`);
      await loadData();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const handleSaveExpense = (updated) => {
    setExpenses((previous) => previous.map((expense) => (expense.id === updated.id ? updated : expense)));
    loadData();
  };

  const handleSaveSettlement = (updated) => {
    setSettlements((previous) => previous.map((settlement) => (settlement.id === updated.id ? updated : settlement)));
    loadData();
  };

  const handleDeleteSettlement = (settlementId) => {
    setSettlements((previous) => previous.filter((settlement) => settlement.id !== settlementId));
    loadData();
  };

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
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" className="btn-primary" style={{ background: theme.base, borderColor: theme.base }} onClick={() => setIsAddingExpense(true)} disabled={members.length < 2}>
                  Lägg till utgift
                </button>
                <button type="button" className="btn-secondary" onClick={() => setIsAddingSettlement(true)}>
                  Kvitta skuld
                </button>
                {isGroupOwner ? (
                  <button type="button" className="btn-secondary" onClick={() => setIsSettingsOpen(true)}>
                    <Settings className="h-4 w-4" />
                    Inställningar
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <article className="rounded-lg border p-4" style={{ background: theme.bgSoft, borderColor: theme.borderSoft }}>
                <div className="mt-2 space-y-1.5">
                  {summary.byCategory.map((category) => {
                    const CategoryIcon = getCategoryIcon(category.icon);
                    return (
                      <div key={`${category.name}-${category.icon}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
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
              <article className="rounded-lg border p-4" style={{ background: theme.bgSoft, borderColor: theme.borderSoft }}>
                <p className="section-eyebrow">Balans</p>
                <div className="mt-2 space-y-1.5">
                  {memberBalances.map((member) => (
                    <div key={member.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">{getUserDisplayName(member)}</span>
                      <span className={`font-semibold ${member.balance > 0 ? 'amount-positive' : member.balance < 0 ? 'amount-negative' : 'amount-neutral'}`}>
                        {member.balance < 0 ? '-' : ''}
                        {formatCurrency(Math.abs(member.balance), { precise: true })}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="grid gap-6">
        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
            <div>
              <p className="section-eyebrow">Aktivitet</p>
              <h2 className="m-0 text-lg font-semibold">Utgifter och betalningar</h2>
            </div>
          </div>

          {timeline.length ? (
            <div>
              {timeline.map((item) => (
                item.kind === 'expense' ? (
                  <ExpenseItem key={`expense-${item.id}`} expense={item} onEdit={setEditingExpenseId} />
                ) : (
                  <SettlementItem key={`settlement-${item.id}`} settlement={item} onEdit={setEditingSettlementId} />
                )
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                icon={Coins}
                title="Ingen aktivitet ännu"
                description="Lägg till den första utgiften eller registrera en betalning så fylls flödet här."
                action={(
                  <button type="button" className="btn-primary" onClick={() => setIsAddingExpense(true)}>
                    Lägg till första utgiften
                  </button>
                )}
              />
            </div>
          )}
        </section>
      </div>

      {isSettingsOpen && isGroupOwner ? (
        <ModalShell
          title="Gruppinställningar"
          description="Bjud in fler personer, ta bort medlemmar eller välj gruppens färgtema."
          onClose={() => setIsSettingsOpen(false)}
        >
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="field-label">Färgtema</p>
              <div className="flex flex-wrap gap-2">
                {GROUP_THEMES.map((t) => {
                  const isActive = (group?.theme_color ?? null) === t.id
                    || (!group?.theme_color && getThemeForGroup(group).id === t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      title={t.name}
                      onClick={() => handleUpdateTheme(t.id)}
                      className="h-7 w-7 rounded-full transition hover:scale-110 focus:outline-none focus-visible:ring-2"
                      style={{
                        background: t.base,
                        outline: isActive ? `2px solid ${t.base}` : undefined,
                        outlineOffset: isActive ? '2px' : undefined,
                        boxShadow: isActive ? `0 0 0 3px rgba(255,255,255,0.9), 0 0 0 5px ${t.base}` : undefined,
                      }}
                      aria-pressed={isActive}
                      aria-label={t.name}
                    />
                  );
                })}
              </div>

              <div className="space-y-3">
                <label className="field-label">
                  Milkostnad för Bilresa (kr/mil)
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={mileageRateDraft}
                    onChange={(event) => setMileageRateDraft(event.target.value)}
                  />
                </label>
                <button type="button" className="btn-secondary" onClick={handleUpdateMileageRate}>
                  Spara milkostnad
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <label className="field-label">
                Lägg till medlem via namn
                <input
                  value={memberSearchQuery}
                  onChange={(event) => setMemberSearchQuery(event.target.value)}
                  placeholder="Sök på fullständigt namn"
                />
              </label>
              {memberSearchQuery.trim() ? (
                <div className="space-y-3">
                  {searchingMembers ? <p className="m-0 text-sm text-[var(--text-secondary)]">Söker...</p> : null}
                  {!searchingMembers && !memberSearchResults.length ? (
                    <p className="m-0 text-sm text-[var(--text-secondary)]">Ingen användare matchade sökningen.</p>
                  ) : null}
                  {memberSearchResults.map((candidate) => (
                    <div key={candidate.id} className="flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="m-0 text-sm font-medium">{getUserSearchLabel(candidate)}</p>
                      </div>
                      <button type="button" className="btn-primary" onClick={() => handleAddMember(candidate.id)}>
                        <UserPlus className="h-4 w-4" />
                        Lägg till
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="m-0 text-sm text-[var(--text-secondary)]">Börja skriva för att söka efter personer att lägga till i gruppen.</p>
              )}
            </div>

            <div className="space-y-3">
              {members.map((member) => (
                <div key={member.id} className="flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="m-0 text-sm font-medium">{getUserDisplayName(member)}</p>
                  </div>
                  <button type="button" className="btn-danger" onClick={() => handleRemoveMember(member.id)}>
                    Ta bort
                  </button>
                </div>
              ))}
            </div>
          </div>
        </ModalShell>
      ) : null}

      {editingExpense ? (
        <EditExpenseModal
          expense={editingExpense}
          members={members}
          categories={expenseCategories}
          mileageRate={mileageRate}
          groupId={id}
          onClose={() => setEditingExpenseId(null)}
          onSave={handleSaveExpense}
          onDelete={handleDeleteExpense}
        />
      ) : null}

      {editingSettlement ? (
        <EditSettlementModal
          settlement={editingSettlement}
          members={members}
          groupId={id}
          onClose={() => setEditingSettlementId(null)}
          onSave={handleSaveSettlement}
          onDelete={handleDeleteSettlement}
        />
      ) : null}

      {isAddingExpense ? (
        <NewExpenseModal
          groupId={id}
          members={members}
          categories={expenseCategories}
          mileageRate={mileageRate}
          onClose={() => setIsAddingExpense(false)}
          onSuccess={loadData}
        />
      ) : null}

      {isAddingSettlement ? (
        <NewSettlementModal
          groupId={id}
          groupName={group?.name}
          members={members}
          balances={balances}
          currentUserId={currentUserId}
          onClose={() => setIsAddingSettlement(false)}
          onSuccess={loadData}
        />
      ) : null}
    </div>
  );
}
