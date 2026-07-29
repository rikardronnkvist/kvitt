import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { post } from '../api/client.js';
import BalanceList from './BalanceList.jsx';
import ModalShell from './ModalShell.jsx';
import { formatCurrency } from '../lib/format.js';
import { getUserDisplayName } from '../lib/users.js';

export default function NewSettlementModal({ groupId, members, balances, currentUserId, onClose, onSuccess }) {
  const defaultPayerId = members.some((member) => String(member.id) === String(currentUserId)) ? String(currentUserId) : '';

  const [formData, setFormData] = useState({
    payer_id: defaultPayerId,
    receiver_id: '',
    amount: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const suggestedAmount = useMemo(() => {
    if (!formData.payer_id || !formData.receiver_id || !balances) return '';

    const payer = Number(formData.payer_id);
    const receiver = Number(formData.receiver_id);
    const match = balances.find((row) => row.from?.id === payer && row.to?.id === receiver);
    return match ? String(match.amount.toFixed(2)) : '';
  }, [formData.payer_id, formData.receiver_id, balances]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

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
      title="Registrera betalning"
      description="Fokusera på en reglering i taget och använd det föreslagna beloppet när det passar."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
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
            {members.map((member) => (
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

        {suggestedAmount ? (
          <button type="button" className="btn-secondary w-full justify-between" onClick={() => handleFieldChange('amount', suggestedAmount)}>
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Använd föreslaget belopp
            </span>
            <span className="amount-neutral">{formatCurrency(suggestedAmount, { precise: true })}</span>
          </button>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-[var(--text-secondary)]" />
            <h3 className="m-0 text-base font-semibold">Föreslagna regleringar</h3>
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
