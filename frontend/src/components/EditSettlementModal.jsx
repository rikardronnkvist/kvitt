import { useEffect, useMemo, useState } from 'react';
import { del, put } from '../api/client.js';
import MemberDropdown from './MemberDropdown.jsx';
import ModalShell from './ModalShell.jsx';
import DateTimePicker from './DateTimePicker.jsx';
import { t } from '../lib/i18n.js';

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
      setError(t('settlementModals.amountMustBePositiveInteger'));
      return;
    }

    if (!formData.payer_id || !formData.receiver_id) {
      setError(t('settlementModals.selectPayerAndReceiver'));
      return;
    }

    if (formData.payer_id === formData.receiver_id) {
      setError(t('settlementModals.payerReceiverMustDiffer'));
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
    if (!window.confirm(t('settlementModals.editDeleteConfirm'))) {
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
      title={t('settlementModals.editTitle')}
      description={t('settlementModals.editDescription')}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="field-label">
                <span>{t('settlementModals.payer')}</span>
          <MemberDropdown
            value={formData.payer_id}
            options={members}
            placeholder={t('settlementModals.selectPayer')}
            onChange={(selectedValue) => setFormData((previous) => ({ ...previous, payer_id: selectedValue }))}
            ariaLabel={t('settlementModals.selectPayer')}
          />
        </label>

        <label className="field-label">
                <span>{t('settlementModals.receiver')}</span>
          <MemberDropdown
            value={formData.receiver_id}
            options={availableReceivers}
            placeholder={t('settlementModals.selectReceiver')}
            onChange={(selectedValue) => setFormData((previous) => ({ ...previous, receiver_id: selectedValue }))}
            ariaLabel={t('settlementModals.selectReceiver')}
          />
        </label>

        <label className="field-label">
                <span>{t('settlementModals.amount')}</span>
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
                <span>{t('settlementModals.settledAt')}</span>
          <DateTimePicker
            value={formData.settled_at}
            onChange={(value) => setFormData((previous) => ({ ...previous, settled_at: value }))}
          />
        </label>

        {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" className="btn-danger" onClick={handleDelete} disabled={saving}>
            {t('common.delete')}
          </button>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? t('shell.saving') : t('expenseModals.saveChanges')}
            </button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}
