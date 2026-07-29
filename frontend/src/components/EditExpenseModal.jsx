import { useEffect, useState } from 'react';
import { put } from '../api/client.js';

export default function EditExpenseModal({ expense, members, groupId, onClose, onSave }) {
  const [formData, setFormData] = useState({
    title: '',
    amount: '',
    currency: 'SEK',
    paid_by_user_id: '',
    notes: '',
  });
  const [splits, setSplits] = useState([]);
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
      });
      setSplits(expense.splits.map((split) => ({
        user_id: split.user_id,
        username: split.username,
        amount_owed: String(split.amount_owed),
      })));
    }
  }, [expense]);

  const handleFieldChange = (field, value) => {
    setFormData((previous) => ({ ...previous, [field]: value }));
  };

  const handleSplitChange = (index, value) => {
    setSplits((previous) => {
      const updated = [...previous];
      updated[index] = { ...updated[index], amount_owed: value };
      return updated;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: formData.title,
        amount: Number(formData.amount),
        currency: formData.currency,
        paid_by_user_id: Number(formData.paid_by_user_id),
        notes: formData.notes || null,
        splits: splits.map((split) => ({
          user_id: split.user_id,
          amount_owed: Number(split.amount_owed),
        })),
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

  if (!expense) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="card modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Redigera utgift"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Redigera utgift</h2>
          <button type="button" className="secondary" onClick={onClose}>Stäng</button>
        </div>

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
              step="0.01"
              value={formData.amount}
              onChange={(e) => handleFieldChange('amount', e.target.value)}
              required
            />
          </label>

          <label>
            Valuta
            <input
              value={formData.currency}
              onChange={(e) => handleFieldChange('currency', e.target.value)}
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
            <legend>Splits</legend>
            <div className="splits-grid">
              {splits.map((split, index) => (
                <div key={index} className="split-row">
                  <span>{split.username}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={split.amount_owed}
                    onChange={(e) => handleSplitChange(index, e.target.value)}
                    required
                  />
                </div>
              ))}
            </div>
          </fieldset>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="form-actions">
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
