import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header.jsx';
import ExpenseItem from '../components/ExpenseItem.jsx';
import BalanceList from '../components/BalanceList.jsx';
import { del, get, getBlob, post } from '../api/client.js';

const tabs = ['Utgifter', 'Saldon', 'Betalningar'];

export default function GroupView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Utgifter');
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [memberUsername, setMemberUsername] = useState('');
  const [settlementForm, setSettlementForm] = useState({ payer_id: '', receiver_id: '', amount: '' });
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
      setSettlementForm((previous) => ({
        payer_id: previous.payer_id || String(groupData.members[0]?.id || ''),
        receiver_id: previous.receiver_id || String(groupData.members[1]?.id || groupData.members[0]?.id || ''),
        amount: previous.amount,
      }));
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
  const memberOptions = useMemo(() => members.map((member) => ({ value: String(member.id), label: member.username })), [members]);

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

  const handleSettlement = async (event) => {
    event.preventDefault();
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
            <button type="button" onClick={() => navigate(`/groups/${id}/expenses/new`)}>Lägg till utgift</button>
            <button type="button" className="secondary" onClick={handleExport}>Exportera CSV</button>
          </div>
        </section>

        <section className="card">
          <h3>Lägg till medlem</h3>
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
          {error ? <p className="error-text">{error}</p> : null}
        </section>

        <section>
          <div className="tab-row">
            {tabs.map((tab) => (
              <button key={tab} type="button" className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'Utgifter' ? (
            <div className="stack">
              {expenses.map((expense) => (
                <ExpenseItem key={expense.id} expense={expense} onDelete={handleDeleteExpense} />
              ))}
              {!expenses.length ? <p>Inga utgifter registrerade ännu.</p> : null}
            </div>
          ) : null}

          {activeTab === 'Saldon' ? <BalanceList balances={balances} /> : null}

          {activeTab === 'Betalningar' ? (
            <div className="stack">
              <form onSubmit={handleSettlement} className="card form-grid">
                <h3>Markera som betald</h3>
                <label>
                  Betalare
                  <select value={settlementForm.payer_id} onChange={(event) => setSettlementForm((previous) => ({ ...previous, payer_id: event.target.value }))}>
                    {memberOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  Mottagare
                  <select value={settlementForm.receiver_id} onChange={(event) => setSettlementForm((previous) => ({ ...previous, receiver_id: event.target.value }))}>
                    {memberOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
      </main>
    </>
  );
}
