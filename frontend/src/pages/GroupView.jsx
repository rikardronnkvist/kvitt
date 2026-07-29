import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header.jsx';
import ExpenseItem from '../components/ExpenseItem.jsx';
import EditExpenseModal from '../components/EditExpenseModal.jsx';
import NewExpenseModal from '../components/NewExpenseModal.jsx';
import BalanceList from '../components/BalanceList.jsx';
import { del, get, getBlob, post, put } from '../api/client.js';

const tabs = ['Utgifter', 'Saldon', 'Betalningar'];

function getCurrentUserId() {
  const token = localStorage.getItem('token');
  if (!token) return null;

  try {
    const [, payload] = token.split('.');
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const data = JSON.parse(atob(padded));
    return data?.id ? String(data.id) : null;
  } catch {
    return null;
  }
}

export default function GroupView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUserId = useMemo(() => getCurrentUserId(), []);
  const [activeTab, setActiveTab] = useState('Utgifter');
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [memberUsername, setMemberUsername] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [settlementForm, setSettlementForm] = useState({ payer_id: '', receiver_id: '', amount: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const getSuggestedSettlementAmount = useCallback((payerId, receiverId, balanceRows) => {
    const payer = Number(payerId);
    const receiver = Number(receiverId);
    if (!payer || !receiver || payer === receiver) return '';

    const match = balanceRows.find(
      (row) => row.from?.id === payer && row.to?.id === receiver,
    );
    return match ? String(match.amount.toFixed(2)) : '';
  }, []);

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
      const members = groupData.members || [];
      const isCurrentUserInGroup = currentUserId && members.some((member) => String(member.id) === currentUserId);
      const fallbackPayerId = String(balancesData[0]?.from?.id || members[0]?.id || '');
      const defaultPayerId = isCurrentUserInGroup ? currentUserId : fallbackPayerId;
      const fallbackReceiverId = String(balancesData[0]?.to?.id || members.find((member) => String(member.id) !== defaultPayerId)?.id || '');
      setSettlementForm((previous) => ({
        payer_id: previous.payer_id || defaultPayerId,
        receiver_id: previous.receiver_id || fallbackReceiverId,
        amount: previous.amount || getSuggestedSettlementAmount(
          previous.payer_id || defaultPayerId,
          previous.receiver_id || fallbackReceiverId,
          balancesData,
        ),
      }));
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, getSuggestedSettlementAmount, id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const members = group?.members ?? [];
  const memberOptions = useMemo(() => members.map((member) => ({ value: String(member.id), label: member.username })), [members]);
  const payerOptions = useMemo(
    () => memberOptions.filter((option) => option.value !== settlementForm.receiver_id),
    [memberOptions, settlementForm.receiver_id],
  );
  const receiverOptions = useMemo(
    () => memberOptions.filter((option) => option.value !== settlementForm.payer_id),
    [memberOptions, settlementForm.payer_id],
  );

  useEffect(() => {
    if (!memberOptions.length) return;

    setSettlementForm((previous) => {
      let payerId = previous.payer_id;
      let receiverId = previous.receiver_id;

      if (!payerId || !memberOptions.some((option) => option.value === payerId)) {
        payerId = memberOptions.find((option) => option.value === currentUserId)?.value || memberOptions[0]?.value || '';
      }

      if (!receiverId || receiverId === payerId || !memberOptions.some((option) => option.value === receiverId)) {
        receiverId = memberOptions.find((option) => option.value !== payerId)?.value || '';
      }

      const suggestedAmount = getSuggestedSettlementAmount(payerId, receiverId, balances);
      if (payerId === previous.payer_id && receiverId === previous.receiver_id && suggestedAmount === previous.amount) {
        return previous;
      }

      return {
        ...previous,
        payer_id: payerId,
        receiver_id: receiverId,
        amount: suggestedAmount,
      };
    });
  }, [balances, currentUserId, getSuggestedSettlementAmount, memberOptions]);

  const handlePayerChange = (value) => {
    setSettlementForm((previous) => {
      const nextReceiverId = previous.receiver_id === value
        ? memberOptions.find((option) => option.value !== value)?.value || ''
        : previous.receiver_id;
      return {
        ...previous,
        payer_id: value,
        receiver_id: nextReceiverId,
        amount: getSuggestedSettlementAmount(value, nextReceiverId, balances),
      };
    });
  };

  const handleReceiverChange = (value) => {
    setSettlementForm((previous) => {
      const nextPayerId = previous.payer_id === value
        ? memberOptions.find((option) => option.value !== value)?.value || ''
        : previous.payer_id;
      return {
        ...previous,
        payer_id: nextPayerId,
        receiver_id: value,
        amount: getSuggestedSettlementAmount(nextPayerId, value, balances),
      };
    });
  };

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

  const handleEditExpense = (expenseId) => {
    setEditingExpenseId(expenseId);
  };

  const handleSaveExpense = (updated) => {
    setExpenses((previous) => previous.map((expense) => (expense.id === updated.id ? updated : expense)));
  };

  const handleExport = async () => {
    try {
      const blob = await getBlob(`/api/expenses/${id}/export`);
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `kvitt-grupp-${id}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError.message);
    }
  };

  const editingExpense = expenses.find((expense) => expense.id === editingExpenseId);

  const sortedTimeline = useMemo(() => {
    const combined = [
      ...expenses.map((e) => ({ ...e, type: 'expense', date: new Date(e.created_at) })),
      ...settlements.map((s) => ({ ...s, type: 'settlement', date: new Date(s.settled_at) })),
    ];
    return combined.sort((a, b) => b.date - a.date);
  }, [expenses, settlements]);

  const handleSettlement = async (event) => {
    event.preventDefault();

    if (!settlementForm.payer_id || !settlementForm.receiver_id || settlementForm.payer_id === settlementForm.receiver_id) {
      setError('Betalare och mottagare måste vara olika personer.');
      return;
    }

    try {
      await post(`/api/settlements/${id}`, {
        payer_id: Number(settlementForm.payer_id),
        receiver_id: Number(settlementForm.receiver_id),
        amount: Number(settlementForm.amount),
      });
      setSettlementForm((previous) => ({ ...previous, amount: '' }));
      await loadData();
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <main className="page-layout"><p>Laddar grupp...</p></main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="page-layout">
        <section className="group-header">
          <div>
            <h2>{group?.name}</h2>
            <p>Medlemmar: {members.map((member) => member.username).join(', ')}</p>
          </div>
          <div className="button-row">
            <button type="button" onClick={() => setIsAddingExpense(true)}>Lägg till utgift</button>
            <button type="button" className="secondary" onClick={handleExport}>Exportera CSV</button>
            <button type="button" className="secondary" onClick={() => setIsSettingsOpen(true)}>Gruppinställningar</button>
          </div>
        </section>

        {error ? <p className="error-text">{error}</p> : null}

        <section>
          <div className="tab-row">
            {tabs.map((tab) => (
              <button key={tab} type="button" className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'Utgifter' ? (
            <div className="group-overview">
              <div className="timeline-section">
                {(expenses.length > 0 || settlements.length > 0) && (
                  <div className="month-summary">
                    <div>
                      <h3>{new Date().toLocaleString('sv-SE', { month: 'long', year: 'numeric' })}</h3>
                    </div>
                    <div className="summary-stats">
                      <span className="total-amount">SEK {expenses.reduce((sum, e) => sum + e.amount, 0).toFixed(0)}</span>
                      <span className="total-count">total spent | {expenses.length} expenses | {settlements.length} payments</span>
                    </div>
                  </div>
                )}
                <div className="timeline-list">
                  {expenses.length === 0 && settlements.length === 0 ? (
                    <p>Ingen aktivitet ännu.</p>
                  ) : (
                    <>
                      {sortedTimeline.map((item) => 
                        item.type === 'expense' ? (
                          <ExpenseItem key={`expense-${item.id}`} expense={item} onDelete={handleDeleteExpense} onEdit={handleEditExpense} />
                        ) : (
                          <article key={`settlement-${item.id}`} className="settlement-row">
                            <div className="settlement-avatar">✓</div>
                            <div className="settlement-details">
                              <div className="settlement-title-row">
                                <h3>{item.payer_username} → {item.receiver_username}</h3>
                              </div>
                              <p className="settlement-description">Payment settled</p>
                              <p className="settlement-date">{new Date(item.settled_at).toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                            <div className="settlement-amount-display">
                              <span className="amount-value">{item.amount.toFixed(0)} SEK</span>
                            </div>
                            <div className="settlement-participants" />
                          </article>
                        )
                      )}
                    </>
                  )}
                </div>
              </div>

              {balances && balances.length > 0 && (
                <div className="balances-section">
                  <h3>Skuldsammanfattning</h3>
                  <BalanceList balances={balances} nested />
                </div>
              )}
            </div>
          ) : null}

          {activeTab === 'Saldon' ? <BalanceList balances={balances} /> : null}

          {activeTab === 'Betalningar' ? (
            <div className="stack">
              <form onSubmit={handleSettlement} className="card form-grid">
                <h3>Markera som betald</h3>
                <label>
                  Betalare
                  <select value={settlementForm.payer_id} onChange={(event) => handlePayerChange(event.target.value)}>
                    {payerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  Mottagare
                  <select value={settlementForm.receiver_id} onChange={(event) => handleReceiverChange(event.target.value)}>
                    {receiverOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  Belopp
                  <input type="number" step="0.01" min="0" value={settlementForm.amount} onChange={(event) => setSettlementForm((previous) => ({ ...previous, amount: event.target.value }))} required />
                </label>
                <button type="submit">Markera som betald</button>
              </form>

              <div className="card">
                <h3>Kvittenser/Betalningar</h3>
                <ul className="list-reset">
                  {settlements.map((settlement) => (
                    <li key={settlement.id}>
                      {settlement.payer_username} betalade {settlement.receiver_username} {settlement.amount.toFixed(2)} SEK den {new Date(settlement.settled_at).toLocaleString('sv-SE')}
                    </li>
                  ))}
                </ul>
                {!settlements.length ? <p>Inga betalningar registrerade ännu.</p> : null}
              </div>
            </div>
          ) : null}
        </section>

        {isSettingsOpen ? (
          <div className="modal-backdrop" role="presentation" onClick={() => setIsSettingsOpen(false)}>
            <section
              className="card modal-card"
              role="dialog"
              aria-modal="true"
              aria-label="Gruppinställningar"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h3>Gruppinställningar</h3>
                <button type="button" className="secondary" onClick={() => setIsSettingsOpen(false)}>Stäng</button>
              </div>
              <h4>Lägg till medlem</h4>
              <form onSubmit={handleAddMember} className="form-inline">
                <input value={memberUsername} onChange={(event) => setMemberUsername(event.target.value)} placeholder="Användarnamn" required />
                <button type="submit">Spara</button>
              </form>
              <ul>
                {members.map((member) => (
                  <li key={member.id} className="member-row">
                    <span>{member.username} ({member.email})</span>
                    <button type="button" className="danger" onClick={() => handleRemoveMember(member.id)}>Ta bort</button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}

        {editingExpense && (
          <EditExpenseModal
            expense={editingExpense}
            members={members}
            groupId={id}
            onClose={() => setEditingExpenseId(null)}
            onSave={handleSaveExpense}
            onDelete={handleDeleteExpense}
          />
        )}

        {isAddingExpense && (
          <NewExpenseModal
            groupId={id}
            members={members}
            onClose={() => setIsAddingExpense(false)}
            onSuccess={loadData}
          />
        )}
      </main>
    </>
  );
}
