import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Coins, Settings, UserPlus, Users } from 'lucide-react';
import ExpenseItem from '../components/ExpenseItem.jsx';
import EditExpenseModal from '../components/EditExpenseModal.jsx';
import NewExpenseModal from '../components/NewExpenseModal.jsx';
import EditSettlementModal from '../components/EditSettlementModal.jsx';
import NewSettlementModal from '../components/NewSettlementModal.jsx';
import BalanceList from '../components/BalanceList.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ModalShell from '../components/ModalShell.jsx';
import { del, get, post } from '../api/client.js';
import { computeMemberBalances } from '../lib/balances.js';
import { formatCurrency, formatDateTime, formatMonthYear } from '../lib/format.js';
import { getCurrentUserId } from '../lib/session.js';

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
  return (
    <article className="flex flex-col gap-4 border-b border-[var(--border-subtle)] px-5 py-5 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--app-surface-muted)] text-[var(--text-secondary)]">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <h3 className="m-0 text-base font-semibold">{settlement.payer_username} betalade {settlement.receiver_username}</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Registrerad betalning</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{formatDateTime(settlement.settled_at)}</p>
        </div>
      </div>
      <div className="flex flex-col items-start gap-3 sm:items-end">
        <p className="m-0 text-lg font-semibold amount-neutral">{formatCurrency(settlement.amount, { precise: true })}</p>
        <button type="button" className="btn-secondary" onClick={() => onEdit(settlement.id)}>
          Redigera
        </button>
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
  const [balances, setBalances] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [memberUsername, setMemberUsername] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editingSettlementId, setEditingSettlementId] = useState(null);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [isAddingSettlement, setIsAddingSettlement] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [groupData, expensesData, balancesData, settlementsData] = await Promise.all([
        get(`/api/groups/${id}`),
        get(`/api/expenses/${id}`),
        get(`/api/settlements/${id}/balances`),
        get(`/api/settlements/${id}`),
      ]);
      setGroup(groupData);
      setExpenses(expensesData);
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

  const members = group?.members ?? [];
  const editingExpense = expenses.find((expense) => expense.id === editingExpenseId);
  const editingSettlement = settlements.find((settlement) => settlement.id === editingSettlementId);

  const timeline = useMemo(() => {
    return [
      ...expenses.map((expense) => ({ ...expense, kind: 'expense', activityDate: expense.created_at })),
      ...settlements.map((settlement) => ({ ...settlement, kind: 'settlement', activityDate: settlement.settled_at })),
    ].sort((a, b) => new Date(b.activityDate) - new Date(a.activityDate));
  }, [expenses, settlements]);

  const memberBalances = useMemo(
    () => computeMemberBalances(members, expenses, settlements),
    [members, expenses, settlements],
  );

  const summary = useMemo(() => {
    const currentMember = memberBalances.find((member) => String(member.id) === currentUserId);
    return {
      totalExpenses: expenses.reduce((sum, expense) => sum + expense.amount, 0),
      activityCount: timeline.length,
      currentUserBalance: currentMember?.balance || 0,
    };
  }, [currentUserId, expenses, memberBalances, timeline.length]);

  const handleAddMember = async (event) => {
    event.preventDefault();
    try {
      await post(`/api/groups/${id}/members`, { username: memberUsername });
      setMemberUsername('');
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
        <button type="button" className="btn-secondary" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" />
          Tillbaka till dashboard
        </button>

        <div className="surface-card space-y-6 p-6 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="section-eyebrow">Grupp</p>
              <h1 className="page-title">{group?.name}</h1>
              <p className="page-copy">{members.map((member) => member.username).join(', ')}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" className="btn-primary" onClick={() => setIsAddingExpense(true)}>
                Lägg till utgift
              </button>
              <button type="button" className="btn-secondary" onClick={() => setIsAddingSettlement(true)}>
                Registrera betalning
              </button>
              <button type="button" className="btn-secondary" onClick={() => setIsSettingsOpen(true)}>
                <Settings className="h-4 w-4" />
                Inställningar
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4">
              <p className="section-eyebrow">Månad</p>
              <p className="m-0 text-lg font-semibold capitalize">{formatMonthYear()}</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{summary.activityCount} aktiviteter registrerade</p>
            </article>
            <article className="rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4">
              <p className="section-eyebrow">Totala utgifter</p>
              <p className="m-0 text-lg font-semibold amount-neutral">{formatCurrency(summary.totalExpenses, { precise: true })}</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{expenses.length} utgifter i gruppen</p>
            </article>
            <article className="rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4">
              <p className="section-eyebrow">Din position</p>
              <p className={`m-0 text-lg font-semibold ${summary.currentUserBalance > 0 ? 'amount-positive' : summary.currentUserBalance < 0 ? 'amount-negative' : 'amount-neutral'}`}>
                {formatCurrency(Math.abs(summary.currentUserBalance), { precise: true })}
              </p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {summary.currentUserBalance > 0 ? 'Du ska få tillbaka pengar' : summary.currentUserBalance < 0 ? 'Du är skyldig pengar' : 'Du är helt kvitt'}
              </p>
            </article>
          </div>
        </div>
      </section>

      {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
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

        <aside className="space-y-4">
          <section className="surface-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-[var(--text-secondary)]" />
              <h2 className="m-0 text-lg font-semibold">Medlemsbalanser</h2>
            </div>
            <div className="space-y-3">
              {memberBalances.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] px-3 py-3">
                  <div>
                    <p className="m-0 text-sm font-medium">{member.full_name || member.username}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {member.balance > 0 ? 'Ska få tillbaka' : member.balance < 0 ? 'Är skyldig' : 'I balans'}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold ${member.balance > 0 ? 'amount-positive' : member.balance < 0 ? 'amount-negative' : 'amount-neutral'}`}>
                    {formatCurrency(Math.abs(member.balance), { precise: true })}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-[var(--text-secondary)]" />
              <h2 className="m-0 text-lg font-semibold">Föreslagna regleringar</h2>
            </div>
            <BalanceList balances={balances} nested />
          </section>
        </aside>
      </div>

      {isSettingsOpen ? (
        <ModalShell
          title="Gruppinställningar"
          description="Bjud in fler personer eller ta bort medlemmar som inte längre ska vara kvar i gruppen."
          onClose={() => setIsSettingsOpen(false)}
        >
          <div className="space-y-6">
            <form onSubmit={handleAddMember} className="space-y-3">
              <label className="field-label">
                Lägg till medlem via användarnamn
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input value={memberUsername} onChange={(event) => setMemberUsername(event.target.value)} placeholder="Användarnamn" required />
                  <button type="submit" className="btn-primary shrink-0">
                    <UserPlus className="h-4 w-4" />
                    Lägg till
                  </button>
                </div>
              </label>
            </form>

            <div className="space-y-3">
              {members.map((member) => (
                <div key={member.id} className="flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="m-0 text-sm font-medium">{member.full_name || member.username}</p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{member.email}</p>
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
          onClose={() => setIsAddingExpense(false)}
          onSuccess={loadData}
        />
      ) : null}

      {isAddingSettlement ? (
        <NewSettlementModal
          groupId={id}
          members={members}
          balances={balances}
          onClose={() => setIsAddingSettlement(false)}
          onSuccess={loadData}
        />
      ) : null}
    </div>
  );
}
