import { useEffect, useState } from 'react';
import { del, put } from '../api/client.js';
import ModalShell from './ModalShell.jsx';

export default function EditSettlementModal({ settlement, members, groupId, onClose, onSave, onDelete }) {
  const [formData, setFormData] = useState({
    payer_id: '',
    receiver_id: '',
    amount: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settlement) {
      setFormData({
        payer_id: String(settlement.payer_id),
        receiver_id: String(settlement.receiver_id),
        amount: String(settlement.amount),
      });
    }
  }, [settlement]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!settlement) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const amount = Number(formData.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Belopp måste vara större än 0.');
      return;
    }

    if (formData.payer_id === formData.receiver_id) {
      setError('Betalare och mottagare måste vara olika personer.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const updated = await put(`/api/settlements/${groupId}/${settlement.id}`, {
        payer_id: Number(formData.payer_id),
        receiver_id: Number(formData.receiver_id),
        amount,
      });
      onSave(updated);
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Är du säker på att du vill ta bort denna betalning?')) {
      return;
    }

    setSaving(true);
    setError('');
    try {
      await del(`/api/settlements/${groupId}/${settlement.id}`);
      onDelete(settlement.id);
      onClose();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Redigera betalning"
      description="Justera mottagare, betalare eller belopp utan att lämna gruppen."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="field-label">
          Betalare
          <select value={formData.payer_id} onChange={(event) => setFormData((previous) => ({ ...previous, payer_id: event.target.value }))} required>
            <option value="">Välj betalare</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name || member.username}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label">
          Mottagare
          <select value={formData.receiver_id} onChange={(event) => setFormData((previous) => ({ ...previous, receiver_id: event.target.value }))} required>
            <option value="">Välj mottagare</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name || member.username}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label">
          Belopp
          <input
            type="number"
            min="0"
            step="0.01"
            value={formData.amount}
            onChange={(event) => setFormData((previous) => ({ ...previous, amount: event.target.value }))}
            required
          />
        </label>

        {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" className="btn-danger" onClick={handleDelete} disabled={saving}>
            Ta bort
          </button>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Avbryt
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Sparar...' : 'Spara ändringar'}
            </button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}
