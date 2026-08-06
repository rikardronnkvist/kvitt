import { useEffect, useMemo, useState } from 'react';
import { post } from '../api/client.js';
import BalanceList from './BalanceList.jsx';
import MemberDropdown from './MemberDropdown.jsx';
import ModalShell from './ModalShell.jsx';
import { getUserDisplayName } from '../lib/users.js';
import DateTimePicker from './DateTimePicker.jsx';
import { useAppSettings } from '../hooks/useAppSettings.js';
import { t } from '../lib/i18n.js';

const DEFAULT_PAYMENT_LINK_CONFIG = Object.freeze({
  base_link: 'https://app.swish.nu/1/p/sw/',
  query_params: Object.freeze({
    phone: 'sw',
    amount: 'amt',
    message: 'msg',
  }),
});

function readPaymentLinkConfig() {
  const rawConfig = import.meta.env.VITE_PAYMENT_LINK_CONFIG;
  if (!rawConfig) {
    return DEFAULT_PAYMENT_LINK_CONFIG;
  }

  try {
    const parsed = JSON.parse(rawConfig);
    const baseLink = typeof parsed?.base_link === 'string' && parsed.base_link.trim()
      ? parsed.base_link.trim()
      : DEFAULT_PAYMENT_LINK_CONFIG.base_link;

    const queryParams = parsed?.query_params && typeof parsed.query_params === 'object'
      ? parsed.query_params
      : {};

    return {
      base_link: baseLink,
      query_params: {
        phone: typeof queryParams.phone === 'string' && queryParams.phone.trim()
          ? queryParams.phone.trim()
          : DEFAULT_PAYMENT_LINK_CONFIG.query_params.phone,
        amount: typeof queryParams.amount === 'string' && queryParams.amount.trim()
          ? queryParams.amount.trim()
          : DEFAULT_PAYMENT_LINK_CONFIG.query_params.amount,
        message: typeof queryParams.message === 'string' && queryParams.message.trim()
          ? queryParams.message.trim()
          : DEFAULT_PAYMENT_LINK_CONFIG.query_params.message,
      },
    };
  } catch {
    return DEFAULT_PAYMENT_LINK_CONFIG;
  }
}

const PAYMENT_LINK_CONFIG = readPaymentLinkConfig();

function toLocalDateTimeInputValue(input) {
  const date = input ? new Date(input) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (value) => String(value).padStart(2, '0');
  return `${safeDate.getFullYear()}-${pad(safeDate.getMonth() + 1)}-${pad(safeDate.getDate())}T${pad(safeDate.getHours())}:${pad(safeDate.getMinutes())}`;
}

function normalizePaymentPhone(phone) {
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

function formatPaymentAmount(amount) {
  return String(Math.round(amount));
}

function sanitizeIntegerInput(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function buildPaymentLink({ phone, amount, message }) {
  const paymentPhone = normalizePaymentPhone(phone);
  if (!paymentPhone || !Number.isInteger(amount) || amount <= 0) {
    return null;
  }
  const paymentAmount = formatPaymentAmount(amount);

  let url;
  try {
    url = new URL(PAYMENT_LINK_CONFIG.base_link);
  } catch {
    url = new URL(DEFAULT_PAYMENT_LINK_CONFIG.base_link);
  }

  url.searchParams.set(PAYMENT_LINK_CONFIG.query_params.phone, paymentPhone);
  url.searchParams.set(PAYMENT_LINK_CONFIG.query_params.amount, paymentAmount);
  url.searchParams.set(PAYMENT_LINK_CONFIG.query_params.message, message.slice(0, 50));
  return url.toString();
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
  const { settings: appSettings } = useAppSettings();
  const defaultPayerId = members.some((member) => String(member.id) === String(currentUserId)) ? String(currentUserId) : '';

  const [formData, setFormData] = useState({
    payer_id: defaultPayerId,
    receiver_id: '',
    amount: '',
    settled_at: toLocalDateTimeInputValue(),
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
  const receiverPaymentPhone = useMemo(
    () => normalizePaymentPhone(selectedReceiver?.phone || null),
    [selectedReceiver],
  );
  const paymentLink = useMemo(
    () => buildPaymentLink({
      phone: receiverPaymentPhone,
      amount: parsedAmount,
      message: t('settlementModals.swishMessage', { groupName: groupName || t('settlementModals.unknownGroup') }),
    }),
    [receiverPaymentPhone, parsedAmount, groupName],
  );
  const paymentAmountText = useMemo(
    () => (Number.isInteger(parsedAmount) && parsedAmount > 0 ? formatPaymentAmount(parsedAmount) : null),
    [parsedAmount],
  );
  const isReceiverCurrentUser = String(selectedReceiver?.id ?? '') === String(currentUserId ?? '');
  const showPaymentSection = appSettings.phone_enabled && Boolean(formData.receiver_id && receiverPaymentPhone);
  const canStartPayment = Boolean(paymentLink && formData.payer_id && formData.receiver_id && !isReceiverCurrentUser);

  const handleClose = () => {
    const isDirty = formData.amount !== '' || formData.receiver_id !== '';
    if (isDirty && !window.confirm(t('settlementModals.discardConfirm'))) return;
    onClose();
  };

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleClose]);

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
    setFormData((previous) => ({
      ...previous,
      [field]: field === 'amount' ? (() => { const raw = sanitizeIntegerInput(value); return raw === '' ? '' : String(Math.min(99999, Math.max(1, Number(raw)))); })() : value,
    }));
    setError('');
  };

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
      await post(`/api/settlements/${groupId}`, {
        payer_id: Number(formData.payer_id),
        receiver_id: Number(formData.receiver_id),
        amount,
        settled_at: formData.settled_at,
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
      title={t('settlementModals.newTitle')}
      description=""
      onClose={handleClose}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-3">
          <div>
            <h3 className="m-0 text-base font-semibold">{t('settlementModals.suggestionsTitle')}</h3>
            <p className="m-0 text-sm text-[var(--text-secondary)]">{t('settlementModals.suggestionsDescription')}</p>
          </div>
          <BalanceList
            balances={balances}
            nested
            onSelect={(balance) => setFormData((previous) => ({
              ...previous,
              payer_id: String(balance.from.id),
              receiver_id: String(balance.to.id),
              amount: String(Math.round(balance.amount)),
            }))}
            isSelected={(balance) => (
              formData.payer_id === String(balance.from.id)
              && formData.receiver_id === String(balance.to.id)
              && formData.amount === String(Math.round(balance.amount))
            )}
          />
        </section>

        <label className="field-label">
          <span>{t('settlementModals.payer')}</span>
          <MemberDropdown
            value={formData.payer_id}
            options={members}
            placeholder={t('settlementModals.selectPayer')}
            onChange={(selectedValue) => handleFieldChange('payer_id', selectedValue)}
            ariaLabel={t('settlementModals.selectPayer')}
          />
        </label>

        <label className="field-label">
          <span>{t('settlementModals.receiver')}</span>
          <MemberDropdown
            value={formData.receiver_id}
            options={availableReceivers}
            placeholder={t('settlementModals.selectReceiver')}
            onChange={(selectedValue) => handleFieldChange('receiver_id', selectedValue)}
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
            onChange={(event) => handleFieldChange('amount', event.target.value)}
            placeholder="0"
            required
          />
        </label>

        <label className="field-label">
          <span>{t('settlementModals.settledAt')}</span>
          <DateTimePicker
            value={formData.settled_at}
            onChange={(value) => handleFieldChange('settled_at', value)}
          />
        </label>

        {showPaymentSection ? (
          <div className="space-y-2">
            {canStartPayment ? (
              <a
                href={paymentLink}
                className="btn-secondary w-full justify-center gap-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src="/swish.png" alt="" className="h-5 w-5" aria-hidden="true" />
                {t('settlementModals.swishTo', { amount: paymentAmountText, name: getUserDisplayName(selectedReceiver) })}
              </a>
            ) : (
              <button type="button" className="btn-secondary w-full justify-center gap-2" disabled>
                <img src="/swish.png" alt="" className="h-5 w-5" aria-hidden="true" />
                {t('settlementModals.swishToName', { name: getUserDisplayName(selectedReceiver) })}
              </button>
            )}
            {!canStartPayment ? (
              <p className="m-0 text-xs text-[var(--text-muted)]">
                {isReceiverCurrentUser ? t('settlementModals.swishSelf') : t('settlementModals.swishNeedsAmount')}
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={handleClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn-primary" disabled={saving || !formData.payer_id || !formData.receiver_id || !(Number.isInteger(parsedAmount) && parsedAmount > 0)}>
            {saving ? t('shell.saving') : t('settlementModals.markSettled')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
