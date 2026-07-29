import { useEffect, useMemo, useState } from 'react';
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

export default function NewExpenseModal({ groupId, members, onClose, onSuccess }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const [form, setForm] = useState({
    title: '',
    amount: '',
    paid_by_user_id: '',
    notes: '',
    included_users: {},
  });

  useEffect(() => {
    const currentUserId = getCurrentUserId();
    const defaultPayerId = members.some((member) => String(member.id) === currentUserId)
      ? currentUserId
      : String(members[0]?.id || '');
    setForm((previous) => ({
      ...previous,
      paid_by_user_id: previous.paid_by_user_id || defaultPayerId,
      included_users: Object.fromEntries(members.map((member) => [member.id, true])),
    }));
  }, [members]);

  const selectedMembers = useMemo(
    () => members.filter((member) => form.included_users[member.id] !== false),
    [members, form.included_users],
  );

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
      await post(`/api/expenses/${groupId}`, payload);
      onSuccess();
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="card modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Lägg till utgift"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Lägg till utgift</h2>
          <button type="button" className="secondary" onClick={onClose}>Stäng</button>
        </div>

        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            Titel
            <input
              value={form.title}
              onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))}
              required
            />
          </label>

          <label>
            Belopp
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm((previous) => ({ ...previous, amount: event.target.value }))}
              required
            />
          </label>

          <label>
            Betald av
            <select
              value={form.paid_by_user_id}
              onChange={(event) => setForm((previous) => ({ ...previous, paid_by_user_id: event.target.value }))}
              required
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>{member.username}</option>
              ))}
            </select>
          </label>

          <label>
            Anteckningar
            <textarea
              value={form.notes}
              onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
              rows="3"
            />
          </label>

          <fieldset className="form-section">
            <legend>Dela med</legend>
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
          </fieldset>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="form-actions">
            <button type="button" onClick={onClose} disabled={saving}>
              Avbryt
            </button>
            <button type="submit" disabled={saving}>
              {saving ? 'Sparar...' : 'Spara'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
