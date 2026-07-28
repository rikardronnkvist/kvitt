import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header.jsx';
import { get, post } from '../api/client.js';

export default function AddExpense() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [equalSplit, setEqualSplit] = useState(true);
  const [form, setForm] = useState({
    title: '',
    amount: '',
    currency: 'SEK',
    paid_by_user_id: '',
    notes: '',
    splits: {},
  });

  useEffect(() => {
    const loadGroup = async () => {
      try {
        const data = await get(`/api/groups/${id}`);
        setGroup(data);
        setForm((previous) => ({
          ...previous,
          paid_by_user_id: previous.paid_by_user_id || String(data.members[0]?.id || ''),
          splits: Object.fromEntries(data.members.map((member) => [member.id, ''])),
        }));
      } catch (loadError) {
        setError(loadError.message);
      }
    };

    loadGroup();
  }, [id]);

  const members = group?.members ?? [];
  const amountNumber = Number(form.amount || 0);
  const calculatedSplits = useMemo(() => {
    if (!members.length || amountNumber <= 0) return [];
    if (equalSplit) return [];
    return members.map((member) => ({
      user_id: member.id,
      amount_owed: Number(form.splits[member.id] || 0),
    }));
  }, [equalSplit, form.splits, members, amountNumber]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = {
        title: form.title,
        amount: Number(form.amount),
        currency: form.currency,
        paid_by_user_id: Number(form.paid_by_user_id),
        notes: form.notes,
        ...(equalSplit ? {} : { splits: calculatedSplits }),
      };
      await post(`/api/expenses/${id}`, payload);
      navigate(`/groups/${id}`);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Header />
      <main className="page-layout narrow">
        <section className="card">
          <h2>Lägg till utgift</h2>
          <form onSubmit={handleSubmit} className="form-grid">
            <label>
              Titel
              <input value={form.title} onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))} required />
            </label>
            <label>
              Belopp
              <input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setForm((previous) => ({ ...previous, amount: event.target.value }))} required />
            </label>
            <label>
              Valuta
              <input value={form.currency} onChange={(event) => setForm((previous) => ({ ...previous, currency: event.target.value }))} required />
            </label>
            <label>
              Betald av
              <select value={form.paid_by_user_id} onChange={(event) => setForm((previous) => ({ ...previous, paid_by_user_id: event.target.value }))} required>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>{member.username}</option>
                ))}
              </select>
            </label>
            <label>
              Anteckningar
              <textarea value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} rows="3" />
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={equalSplit} onChange={(event) => setEqualSplit(event.target.checked)} />
              Dela lika
            </label>

            {!equalSplit ? (
              <div className="split-grid">
                {members.map((member) => (
                  <label key={member.id}>
                    {member.username}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.splits[member.id] ?? ''}
                      onChange={(event) => setForm((previous) => ({
                        ...previous,
                        splits: { ...previous.splits, [member.id]: event.target.value },
                      }))}
                    />
                  </label>
                ))}
              </div>
            ) : null}
            {error ? <p className="error-text">{error}</p> : null}
            <div className="button-row">
              <button type="submit" disabled={saving}>{saving ? 'Sparar...' : 'Spara'}</button>
              <button type="button" className="secondary" onClick={() => navigate(`/groups/${id}`)}>Avbryt</button>
            </div>
          </form>
        </section>
      </main>
    </>
  );
}
