import { useEffect, useMemo, useState } from 'react';
import { del, put } from '../api/client.js';
import MemberDropdown from './MemberDropdown.jsx';
import ModalShell from './ModalShell.jsx';
import DateTimePicker from './DateTimePicker.jsx';

function sanitizeIntegerInput(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function toLocalDateTimeInputValue(input) {
  const raw = String(input || '').trim();
  const directMatch = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?$/.exec(raw);
  if (directMatch) {
    return `${directMatch[1]}T${directMatch[2]}`;
  }

  const date = input ? new Date(input) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (value) => String(value).padStart(2, '0');
  return `${safeDate.getFullYear()}-${pad(safeDate.getMonth() + 1)}-${pad(safeDate.getDate())}T${pad(safeDate.getHours())}:${pad(safeDate.getMinutes())}`;
}

export default function EditSettlementModal({ settlement, members, groupId, onClose, onSave, onDelete }) {
  const [formData, setFormData] = useState({
    payer_id: '',
    receiver_id: '',
    amount: '',
    settled_at: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const availableReceivers = useMemo(
    () => members.filter((member) => String(member.id) !== String(formData.payer_id)),
    [members, formData.payer_id],
  );

  useEffect(() => {
    if (settlement) {
      setFormData({
        payer_id: String(settlement.payer_id),
        receiver_id: String(settlement.receiver_id),
        amount: String(Math.round(settlement.amount)),
        settled_at: toLocalDateTimeInputValue(settlement.settled_at),
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

  useEffect(() => {
    if (!formData.receiver_id) {
      return;
    }
    const receiverStillAvailable = availableReceivers.some((member) => String(member.id) === String(formData.receiver_id));
    if (!receiverStillAvailable) {
      setFormData((previous) => ({ ...previous, receiver_id: '' }));
    }
  }, [availableReceivers, formData.receiver_id]);

  if (!settlement) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const amount = Number(formData.amount);

    if (!Number.isInteger(amount) || amount <= 0) {
      setError('Belopp måste vara ett heltal större än 0.');
      return;
    }

    if (!formData.payer_id || !formData.receiver_id) {
      setError('Välj både betalare och mottagare.');
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
        settled_at: formData.settled_at,
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
      await onDelete(settlement.id);
      onClose();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Redigera kvittning"
      description="Justera mottagare, betalare, belopp eller tidpunkt"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="field-label">
                <span>Betalare</span>
          <MemberDropdown
            value={formData.payer_id}
            options={members}
            placeholder="Välj betalare"
            onChange={(selectedValue) => setFormData((previous) => ({ ...previous, payer_id: selectedValue }))}
            ariaLabel="Välj betalare"
          />
        </label>

        <label className="field-label">
                <span>Mottagare</span>
          <MemberDropdown
            value={formData.receiver_id}
            options={availableReceivers}
            placeholder="Välj mottagare"
            onChange={(selectedValue) => setFormData((previous) => ({ ...previous, receiver_id: selectedValue }))}
            ariaLabel="Välj mottagare"
          />
        </label>

        <label className="field-label">
                <span>Belopp</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={formData.amount}
            onChange={(event) => setFormData((previous) => { const raw = sanitizeIntegerInput(event.target.value); return { ...previous, amount: raw === '' ? '' : String(Math.min(99999, Math.max(1, Number(raw)))) }; })}
            required
          />
        </label>

        <label className="field-label">
                <span>Tidpunkt för kvittningen</span>
          <DateTimePicker
            value={formData.settled_at}
            onChange={(value) => setFormData((previous) => ({ ...previous, settled_at: value }))}
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
