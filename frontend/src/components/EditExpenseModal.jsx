import { useEffect, useMemo, useState } from 'react';
import { del, put } from '../api/client.js';

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

export default function EditExpenseModal({ expense, members, groupId, onClose, onSave, onDelete }) {
  const [formData, setFormData] = useState({
    title: '',
    amount: '',
    currency: 'SEK',
    paid_by_user_id: '',
    notes: '',
    included_users: {},
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (expense) {
      setFormData({
        title: expense.title,
        amount: String(expense.amount),
        currency: expense.currency,
        paid_by_user_id: String(expense.paid_by_user_id),
        notes: expense.notes || '',
        included_users: Object.fromEntries(
          members.map((member) => [
            member.id,
            expense.splits.some((split) => split.user_id === member.id),
          ])
        ),
      });
    }
  }, [expense, members]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const selectedMembers = useMemo(
    () => members.filter((member) => formData.included_users[member.id] !== false),
    [members, formData.included_users],
  );

  const handleFieldChange = (field, value) => {
    setFormData((previous) => ({ ...previous, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const amount = Number(formData.amount);

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
        title: formData.title,
        amount,
        currency: formData.currency,
        paid_by_user_id: Number(formData.paid_by_user_id),
        notes: formData.notes || null,
        splits: buildEqualSplits(amount, selectedMembers),
      };
      const updated = await put(`/api/expenses/${groupId}/${expense.id}`, payload);
      onSave(updated);
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Är du säker på att du vill ta bort denna utgift?')) {
      setSaving(true);
      try {
        await del(`/api/expenses/${groupId}/${expense.id}`);
        onDelete(expense.id);
        onClose();
      } catch (deleteError) {
        setError(deleteError.message);
      } finally {
        setSaving(false);
      }
    }
  };

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!expense) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Redigera utgift"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Redigera utgift</h2>

        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            Titel
            <input
              value={formData.title}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              required
            />
          </label>

          <label>
            Belopp
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.amount}
              onChange={(e) => handleFieldChange('amount', e.target.value)}
              required
            />
          </label>

          <label>
            Betald av
            <select
              value={formData.paid_by_user_id}
              onChange={(e) => handleFieldChange('paid_by_user_id', e.target.value)}
              required
            >
              <option value="">-- Välj --</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.username}
                </option>
              ))}
            </select>
          </label>

          <label>
            Anteckningar
            <textarea
              value={formData.notes}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
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
                    checked={formData.included_users[member.id] !== false}
                    onChange={(event) => setFormData((previous) => ({
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
            <button type="button" className="danger" onClick={handleDelete} disabled={saving}>
              Ta bort
            </button>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={onClose} disabled={saving}>
              Avbryt
            </button>
            <button type="submit" disabled={saving}>
              {saving ? 'Sparar...' : 'Spara ändringar'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
