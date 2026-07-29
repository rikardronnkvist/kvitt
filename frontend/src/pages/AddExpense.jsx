import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header.jsx';
import { get, post } from '../api/client.js';

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

export default function AddExpense() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    amount: '',
    paid_by_user_id: '',
    notes: '',
    included_users: {},
  });

  useEffect(() => {
    const loadGroup = async () => {
      try {
        const data = await get(`/api/groups/${id}`);
        const currentUserId = getCurrentUserId();
        const defaultPayerId = data.members.some((member) => String(member.id) === currentUserId)
          ? currentUserId
          : String(data.members[0]?.id || '');
        setGroup(data);
        setForm((previous) => ({
          ...previous,
          paid_by_user_id: previous.paid_by_user_id || defaultPayerId,
          included_users: Object.fromEntries(data.members.map((member) => [member.id, true])),
        }));
      } catch (loadError) {
        setError(loadError.message);
      }
    };

    loadGroup();
  }, [id]);

  const members = group?.members ?? [];
  const selectedMembers = useMemo(
    () => members.filter((member) => form.included_users[member.id] !== false),
    [members, form.included_users],
  );

  function buildEqualSplits(amount, splitMembers) {
    if (!splitMembers.length) return [];
    const totalCents = Math.round(amount * 100);
    const baseCents = Math.floor(totalCents / splitMembers.length);
    let remainder = totalCents - baseCents * splitMembers.length;

    return splitMembers.map((member) => {
      const extraCent = remainder > 0 ? 1 : 0;
      remainder -= extraCent;
      return {
        user_id: member.id,
        amount_owed: (baseCents + extraCent) / 100,
      };
    });
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    const amount = Number(form.amount);

    if (!selectedMembers.length) {
      setError('Välj minst en person att dela utgiften med.');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Belopp måste vara större än 0.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        title: form.title,
        amount,
        paid_by_user_id: Number(form.paid_by_user_id),
        notes: form.notes,
        splits: buildEqualSplits(amount, selectedMembers),
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
            <div>
              <p>Dela med</p>
              <div className="split-grid">
                {members.map((member) => (
                  <label key={member.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={form.included_users[member.id] !== false}
                      onChange={(event) => setForm((previous) => ({
                        ...previous,
                        included_users: {
                          ...previous.included_users,
                          [member.id]: event.target.checked,
                        },
                      }))}
                    />
                    {member.username}
                  </label>
                ))}
              </div>
            </div>
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
