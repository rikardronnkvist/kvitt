import { useEffect, useMemo, useState } from 'react';
import { post } from '../api/client.js';
import BalanceList from './BalanceList.jsx';
import ModalShell from './ModalShell.jsx';
import { getUserDisplayName } from '../lib/users.js';

function normalizeSwishPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) {
    return digits.startsWith('+46') ? digits.slice(1) : null;
  }
  if (digits.startsWith('00')) {
    const normalized = digits.slice(2);
    return normalized.startsWith('46') ? normalized : null;
  }
  if (digits.startsWith('0')) {
    return `46${digits.slice(1)}`;
  }
  if (digits.startsWith('46')) {
    return digits;
  }
  return null;
}

function formatSwishAmount(amount) {
  return String(Math.round(amount));
}

function buildSwishLink({ phone, amount, message }) {
  const swishPhone = normalizeSwishPhone(phone);
  if (!swishPhone || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const encodedMessage = encodeURIComponent(message.slice(0, 50));
  const swishAmount = formatSwishAmount(amount);
  return `https://app.swish.nu/1/p/sw/?sw=${swishPhone}&amt=${swishAmount}&msg=${encodedMessage}`;
}

export default function NewSettlementModal({
  groupId,
  groupName,
  members,
  balances,
  currentUserId,
  onClose,
  onSuccess,
}) {
  const defaultPayerId = members.some((member) => String(member.id) === String(currentUserId)) ? String(currentUserId) : '';

  const [formData, setFormData] = useState({
    payer_id: defaultPayerId,
    receiver_id: '',
    amount: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const availableReceivers = useMemo(
    () => members.filter((member) => String(member.id) !== String(formData.payer_id)),
    [members, formData.payer_id],
  );

  const selectedReceiver = useMemo(
    () => members.find((member) => String(member.id) === String(formData.receiver_id)) || null,
    [members, formData.receiver_id],
  );
  const parsedAmount = Number(formData.amount);
  const receiverSwishPhone = useMemo(
    () => normalizeSwishPhone(selectedReceiver?.phone || null),
    [selectedReceiver],
  );
  const swishLink = useMemo(
    () => buildSwishLink({
      phone: receiverSwishPhone,
      amount: parsedAmount,
      message: `Kvittar skuld (${groupName || 'Okänd grupp'})`,
    }),
    [receiverSwishPhone, parsedAmount, groupName],
  );
  const swishAmountText = useMemo(
    () => (Number.isFinite(parsedAmount) && parsedAmount > 0 ? formatSwishAmount(parsedAmount) : null),
    [parsedAmount],
  );
  const showSwishSection = Boolean(formData.receiver_id && receiverSwishPhone);
  const canSwish = Boolean(swishLink && formData.payer_id && formData.receiver_id);

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

  const handleFieldChange = (field, value) => {
    setFormData((previous) => ({ ...previous, [field]: value }));
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const amount = Number(formData.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Belopp måste vara större än 0.');
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
      await post(`/api/settlements/${groupId}`, {
        payer_id: Number(formData.payer_id),
        receiver_id: Number(formData.receiver_id),
        amount,
      });
      await onSuccess();
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Kvitta skuld"
      description=""
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
          <div>
            <h3 className="m-0 text-base font-semibold">Förslag för att alla ska bli kvitt</h3>
          </div>
          <BalanceList
            balances={balances}
            nested
            onSelect={(balance) => setFormData((previous) => ({
              ...previous,
              payer_id: String(balance.from.id),
              receiver_id: String(balance.to.id),
              amount: String(balance.amount.toFixed(2)),
            }))}
          />
        </section>

        <label className="field-label">
          Betalare
          <select value={formData.payer_id} onChange={(event) => handleFieldChange('payer_id', event.target.value)} required>
            <option value="">Välj betalare</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {getUserDisplayName(member)}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label">
          Mottagare
          <select value={formData.receiver_id} onChange={(event) => handleFieldChange('receiver_id', event.target.value)} required>
            <option value="">Välj mottagare</option>
            {availableReceivers.map((member) => (
              <option key={member.id} value={member.id}>
                {getUserDisplayName(member)}
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
            onChange={(event) => handleFieldChange('amount', event.target.value)}
            placeholder="0"
            required
          />
        </label>

        {showSwishSection ? (
          <div className="space-y-2">
            {canSwish ? (
              <a
                href={swishLink}
                className="btn-secondary w-full justify-center gap-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src="/swish.png" alt="" className="h-5 w-5" aria-hidden="true" />
                Swisha {swishAmountText} kr till {getUserDisplayName(selectedReceiver)}
              </a>
            ) : (
              <button type="button" className="btn-secondary w-full justify-center gap-2" disabled>
                <img src="/swish.png" alt="" className="h-5 w-5" aria-hidden="true" />
                Swisha {getUserDisplayName(selectedReceiver)}
              </button>
            )}
            {!canSwish ? (
              <p className="m-0 text-xs text-[var(--text-muted)]">Fyll i belopp för att starta Swish.</p>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Avbryt
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Sparar...' : 'Markera som betald'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
