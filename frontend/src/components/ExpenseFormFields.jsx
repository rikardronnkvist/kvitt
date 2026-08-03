import { ReceiptText, SplitSquareVertical } from 'lucide-react';
import { buildExpensePayload, getSplitSummary } from '../lib/expenseForm.js';
import { getCategoryIcon } from '../lib/expenseCategories.js';
import { formatCurrency } from '../lib/format.js';
import { getUserDisplayName } from '../lib/users.js';
import MemberDropdown from './MemberDropdown.jsx';
import DateTimePicker from './DateTimePicker.jsx';

function SplitTypeButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition',
        active
          ? 'border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)] text-[var(--text-primary)]'
          : 'border-[var(--border-subtle)] bg-[var(--app-surface-strong)] text-[var(--text-secondary)] hover:bg-[var(--app-surface-muted)]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function sanitizeIntegerInput(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export default function ExpenseFormFields({
  form,
  setForm,
  members,
  categories,
  mileageRate = 20,
  error,
  saving,
  onCancel,
  onDelete,
  onSubmit,
  onError,
  submitLabel,
}) {
  const { selectedMembers, equalSplits, customTotal, customDifference, hasValidAmount } = getSplitSummary(form, members);
  const selectedCategory = categories.find((category) => String(category.id) === String(form.category_id));
  const isCarTripCategory = selectedCategory?.icon === 'car';
  const isCarTripTitle = (title) => /^(?:Bil|Bilresa)(?:\s+\d+\s+mil)?$/u.test(title.trim());
  const getCarTripTitle = (distanceMil) => `Bil ${distanceMil} mil`;

  function handleCancel() {
    onCancel();
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const payload = buildExpensePayload(form, members);
      await onSubmit(payload);
    } catch (submitError) {
      onError?.(submitError.message);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <p className="section-eyebrow">Kategori</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          {categories.map((category) => {
            const Icon = getCategoryIcon(category.icon);
            const isActive = String(form.category_id) === String(category.id);
            return (
              <button
                key={category.id}
                type="button"
                title={category.name}
                onClick={() => setForm((previous) => {
                  const previousCategory = categories.find((item) => String(item.id) === String(previous.category_id));
                  const trimmedTitle = previous.title.trim();
                  const shouldSyncTitle = !trimmedTitle
                    || (previousCategory && trimmedTitle === previousCategory.name)
                    || isCarTripTitle(trimmedTitle);
                  const selectingCarTrip = category.icon === 'car';
                  const fallbackDistance = Number(previous.distance_mil);
                  const fallbackFromAmount = Number(previous.amount);
                  const derivedDistance = Number.isFinite(fallbackDistance) && fallbackDistance >= 0
                    ? Math.round(fallbackDistance)
                    : Number.isFinite(fallbackFromAmount) && fallbackFromAmount >= 0 && mileageRate > 0
                      ? Math.round(fallbackFromAmount / mileageRate)
                      : 0;

                  return {
                    ...previous,
                    category_id: String(category.id),
                    distance_mil: selectingCarTrip ? String(derivedDistance) : previous.distance_mil,
                    title: selectingCarTrip
                      ? getCarTripTitle(derivedDistance)
                      : shouldSyncTitle
                        ? category.name
                        : previous.title,
                  };
                })}
                className={[
                  'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--text-primary)]'
                    : 'border-[var(--border-subtle)] bg-[var(--app-surface-strong)] text-[var(--text-secondary)] hover:bg-[var(--app-surface-muted)]',
                ].join(' ')}
                aria-pressed={isActive}
                aria-label={category.name}
              >
                <Icon className="h-5 w-5" />
                {category.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="field-label md:col-span-2">
          Titel
          <input
            value={form.title}
            onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))}
            placeholder="Till exempel middag eller hotell"
            readOnly={isCarTripCategory}
            style={isCarTripCategory ? { background: 'var(--app-surface-muted)', color: 'var(--text-muted)', cursor: 'not-allowed' } : undefined}
            required
          />
        </label>

        {isCarTripCategory ? (
          <label className="field-label">
            <span>Antal mil <span className="text-[var(--text-muted)] font-normal">({mileageRate} kr/mil)</span></span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={form.distance_mil || ''}
              onChange={(event) => {
                const distanceMil = sanitizeIntegerInput(event.target.value);
                const numericDistance = Number(distanceMil);
                const calculatedAmount = Number.isFinite(numericDistance) && numericDistance >= 0
                  ? String(Math.round(numericDistance * mileageRate))
                  : '';
                setForm((previous) => ({
                  ...previous,
                  distance_mil: distanceMil,
                  amount: calculatedAmount,
                  title: getCarTripTitle(distanceMil || 0),
                }));
              }}
              placeholder="0"
            />
          </label>
        ) : null}

        <label className="field-label">
          Belopp
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={form.amount}
            onChange={(event) => {
              const amountValue = sanitizeIntegerInput(event.target.value);
              const numericAmount = Number(amountValue);
              const derivedDistance = Number.isFinite(numericAmount) && numericAmount >= 0 && mileageRate > 0
                ? String(Math.round(numericAmount / mileageRate))
                : '';
              setForm((previous) => ({
                ...previous,
                amount: amountValue,
                distance_mil: isCarTripCategory ? derivedDistance : previous.distance_mil,
                title: isCarTripCategory ? getCarTripTitle(derivedDistance || 0) : previous.title,
              }));
            }}
            placeholder="0"
            required
          />
        </label>

        {!isCarTripCategory ? <div className="hidden md:block" aria-hidden="true" /> : null}

        <label className="field-label md:col-span-2">
          Betald av
          <MemberDropdown
            value={form.paid_by_user_id}
            options={members}
            placeholder="Välj betalare"
            onChange={(selectedValue) => setForm((previous) => ({ ...previous, paid_by_user_id: selectedValue }))}
            ariaLabel="Välj vem som betalade"
          />
        </label>

        <label className="field-label md:col-span-2">
          <span>Datum och tid för utlägget</span>
          <DateTimePicker
            value={form.occurred_at}
            onChange={(value) => setForm((previous) => ({ ...previous, occurred_at: value }))}
          />
        </label>

        <label className="field-label md:col-span-2">
          Anteckningar
          <textarea
            rows="3"
            value={form.notes}
            onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
          />
        </label>
      </div>

      <div className="surface-card space-y-4 p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <SplitSquareVertical className="h-4 w-4 text-[var(--text-secondary)]" />
            <h3 className="m-0 text-base font-semibold">Dela utgiften</h3>
          </div>
          <p className="m-0 text-sm text-[var(--text-secondary)]">Välj vilka som ska dela kostnaden och hur den ska fördelas.</p>
        </div>

        <div className="flex flex-col gap-3 md:flex-row">
          <SplitTypeButton
            active={form.split_type === 'equal'}
            onClick={() => setForm((previous) => ({ ...previous, split_type: 'equal' }))}
          >
            Lika delar
          </SplitTypeButton>
          <SplitTypeButton
            active={form.split_type === 'custom'}
            onClick={() => setForm((previous) => ({ ...previous, split_type: 'custom' }))}
          >
            Egna belopp
          </SplitTypeButton>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {members.map((member) => {
            const checked = form.included_users[member.id] !== false;
            return (
              <label
                key={member.id}
                className={[
                  'flex min-h-11 items-center gap-3 rounded-lg border px-3 py-3 transition',
                  checked
                    ? 'border-[var(--border-strong)] bg-[var(--app-surface-muted)]'
                    : 'border-[var(--border-subtle)] bg-[var(--app-surface-strong)]',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setForm((previous) => ({
                    ...previous,
                    included_users: {
                      ...previous.included_users,
                      [member.id]: event.target.checked,
                    },
                  }))}
                />
                <span className="text-sm font-medium">{getUserDisplayName(member)}</span>
              </label>
            );
          })}
        </div>

        {form.split_type === 'equal' ? (
          <div className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-[var(--text-secondary)]" />
              <p className="m-0 text-sm font-medium">Förhandsvisning</p>
            </div>
            <div className="space-y-2">
              {equalSplits.map((split) => {
                const member = members.find((item) => item.id === split.user_id);
                return (
                  <div key={split.user_id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-[var(--text-secondary)]">{member ? getUserDisplayName(member) : 'Okänd användare'}</span>
                    <span className="font-medium amount-neutral">{formatCurrency(split.amount_owed, { precise: true })}</span>
                  </div>
                );
              })}
              {!equalSplits.length ? <p className="m-0 text-sm text-[var(--text-muted)]">Ange ett belopp för att se fördelningen.</p> : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Egen fördelning</span>
              <span className={[
                'font-medium',
                !hasValidAmount ? 'text-[var(--text-secondary)]' : customDifference === 0 ? 'amount-positive' : 'amount-negative',
              ].join(' ')}>
                {!hasValidAmount
                  ? 'Ange totalbelopp först'
                  : customDifference === 0
                    ? 'Summerar korrekt'
                    : `${customDifference > 0 ? 'Återstår' : 'Över'} ${formatCurrency(Math.abs(customDifference), { precise: true })}`}
              </span>
            </div>
            <div className="space-y-3">
              {selectedMembers.map((member) => (
                <label key={member.id} className="field-label">
                  {getUserDisplayName(member)}
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={form.custom_amounts[member.id] || ''}
                    onChange={(event) => setForm((previous) => ({
                      ...previous,
                      custom_amounts: {
                        ...previous.custom_amounts,
                        [member.id]: sanitizeIntegerInput(event.target.value),
                      },
                    }))}
                    placeholder="0"
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3 text-sm">
              <span className="text-[var(--text-secondary)]">Summa</span>
              <span className="font-medium amount-neutral">{formatCurrency(customTotal, { precise: true })}</span>
            </div>
          </div>
        )}
      </div>

      {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>{onDelete ? <button type="button" className="btn-danger w-full sm:w-auto" onClick={onDelete} disabled={saving}>Ta bort</button> : null}</div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" className="btn-secondary w-full sm:w-auto" onClick={handleCancel} disabled={saving}>
            Avbryt
          </button>
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={saving}>
            {saving ? 'Sparar...' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
