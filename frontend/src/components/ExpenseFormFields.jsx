import { useEffect, useRef, useState } from 'react';
import { Banknote, ChevronDown, Columns4, Percent, SquareSplitHorizontal } from 'lucide-react';
import { buildExpensePayload, getSplitSummary } from '../lib/expenseForm.js';
import { getCategoryIcon } from '../lib/expenseCategories.js';
import { formatCurrency } from '../lib/format.js';
import { getUserDisplayName } from '../lib/users.js';
import MemberDropdown from './MemberDropdown.jsx';
import UserAvatar from './UserAvatar.jsx';
import DateTimePicker from './DateTimePicker.jsx';

const SPLIT_TYPE_OPTIONS = [
  { value: 'all_equal', label: 'Alla delar lika', Icon: SquareSplitHorizontal },
  { value: 'equal', label: 'Delas mellan några', Icon: Columns4 },
  { value: 'custom', label: 'Egna belopp', Icon: Banknote },
  { value: 'percent', label: 'Egna procent', Icon: Percent },
];

function getEqualPctLabel(pct, isIncluded) {
  if (pct != null) return `${pct}%`;
  return isIncluded ? '' : '0%';
}

function SplitTypeDropdown({ value, onChange, membersCount }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = SPLIT_TYPE_OPTIONS.find((o) => o.value === value);
  const getLabel = (optValue, label) => optValue === 'all_equal' ? `Alla ${membersCount} delar lika` : label;

  useEffect(() => {
    if (!open) return;
    function handleOutside(event) {
      if (!ref.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Fördelningstyp"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center gap-2 rounded-[var(--radius-field)] border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-[0.95rem] py-[0.875rem] text-left text-[length:inherit] transition focus:border-[var(--accent)] focus:outline-none focus:ring-[3px] focus:ring-[color-mix(in_srgb,var(--accent)_16%,transparent)]"
      >
        {selected && <selected.Icon className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />}
        <span className="flex-1 truncate">{selected ? getLabel(selected.value, selected.label) : ''}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
      </button>
      {open && (
        <ul role="listbox" aria-label="Fördelningstyp" className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-field)] border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] py-1 shadow-lg">
          {SPLIT_TYPE_OPTIONS.map(({ value: optValue, label, Icon }) => (
            <li
              key={optValue}
              role="option"
              aria-selected={optValue === value}
              tabIndex={0}
              onClick={() => { onChange(optValue); setOpen(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(optValue); setOpen(false); } }}
              className={[
                'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition',
                optValue === value
                  ? 'bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] text-[var(--text-primary)]'
                  : 'text-[var(--text-primary)] hover:bg-[var(--app-surface-muted)]',
              ].join(' ')}
            >
              <Icon className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
              {getLabel(optValue, label)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function sanitizeIntegerInput(value) {
  return String(value ?? '').replace(/\D/g, '');
}

const CAR_TRIP_TITLE_PATTERN = /^(?:Bil|Bilresa)(?:\s+\d+\s+mil)?$/u;

function isCarTripTitle(title) {
  return CAR_TRIP_TITLE_PATTERN.test(String(title || '').trim());
}

function getCarTripTitle(distanceMil) {
  return `Bil ${distanceMil} mil`;
}

function deriveDistanceMil({ distance_mil: distanceMil, amount }, mileageRate) {
  const fallbackDistance = Number(distanceMil);
  if (distanceMil !== '' && Number.isFinite(fallbackDistance) && fallbackDistance > 0) {
    return Math.round(fallbackDistance);
  }

  const fallbackFromAmount = Number(amount);
  if (Number.isFinite(fallbackFromAmount) && fallbackFromAmount >= 0 && mileageRate > 0) {
    return Math.round(fallbackFromAmount / mileageRate);
  }

  return 0;
}

function getCategorySelectionUpdate(previous, category, categories, mileageRate) {
  const previousCategory = categories.find((item) => String(item.id) === String(previous.category_id));
  const trimmedTitle = previous.title.trim();
  const shouldSyncTitle = !trimmedTitle
    || (previousCategory && trimmedTitle === previousCategory.name)
    || isCarTripTitle(trimmedTitle);
  const selectingCarTrip = category.icon === 'car';
  const derivedDistance = deriveDistanceMil(previous, mileageRate);
  let nextTitle = previous.title;

  if (selectingCarTrip) {
    nextTitle = getCarTripTitle(derivedDistance);
  } else if (shouldSyncTitle) {
    nextTitle = category.name;
  }

  return {
    ...previous,
    category_id: String(category.id),
    distance_mil: selectingCarTrip ? String(derivedDistance) : previous.distance_mil,
    title: nextTitle,
  };
}

function getDistanceMilUpdate(previous, distanceMil, mileageRate) {
  const numericDistance = Number(distanceMil);
  const calculatedAmount = Number.isFinite(numericDistance) && numericDistance >= 0
    ? String(Math.round(numericDistance * mileageRate))
    : '';

  return {
    ...previous,
    distance_mil: distanceMil,
    amount: calculatedAmount,
    title: getCarTripTitle(distanceMil || 0),
  };
}

function getAmountUpdate(previous, amountValue, isCarTripCategory, mileageRate) {
  const numericAmount = Number(amountValue);
  const derivedDistance = Number.isFinite(numericAmount) && numericAmount >= 0 && mileageRate > 0
    ? String(Math.round(numericAmount / mileageRate))
    : '';

  return {
    ...previous,
    amount: amountValue,
    distance_mil: isCarTripCategory ? derivedDistance : previous.distance_mil,
    title: isCarTripCategory ? getCarTripTitle(derivedDistance || 0) : previous.title,
  };
}

function getCustomDifferenceText(hasValidAmount, customDifference) {
  if (!hasValidAmount) {
    return 'Ange totalbelopp först';
  }
  if (customDifference === 0) {
    return 'Summerar korrekt';
  }
  return `${customDifference > 0 ? 'Återstår' : 'Över'} ${formatCurrency(Math.abs(customDifference), { precise: true })}`;
}

function getCustomDifferenceClass(hasValidAmount, customDifference) {
  if (!hasValidAmount) {
    return 'text-[var(--text-secondary)]';
  }
  return customDifference === 0 ? 'amount-positive' : 'amount-negative';
}

function CategorySelector({ categories, form, setForm, mileageRate }) {
  return (
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
              onClick={() => setForm((previous) => getCategorySelectionUpdate(previous, category, categories, mileageRate))}
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
  );
}

function SplitDetailsPanel({
  form,
  amount,
  equalSplits,
  members,
  selectedMembers,
  customDifference,
  customTotal,
  hasValidAmount,
  percentTotal,
  percentSplits,
  percentDifference,
  setForm,
}) {
  if (form.split_type === 'percent') {
    const diffLabel = percentDifference === 0
      ? 'Summerar 100%'
      : `${percentDifference > 0 ? 'Återstår' : 'Över'} ${Math.abs(percentDifference)}%`;
    const diffClass = percentDifference === 0 ? 'amount-positive' : 'amount-negative';
    return (
      <div className="space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4">
        <div className="space-y-3">
          {members.map((member) => {
            const computed = percentSplits.find((s) => s.user_id === member.id);
            return (
              <div key={member.id} className="flex items-center gap-3">
                <UserAvatar
                  user={member}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--app-surface-strong)] text-xs font-semibold text-[var(--text-secondary)] ring-1 ring-[var(--border-subtle)]"
                  initialsClassName=""
                  imageClassName="h-full w-full object-cover"
                />
                <span className="flex-1 truncate text-sm">{getUserDisplayName(member)}</span>
                <div className="relative w-16 sm:w-20 shrink-0">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={form.custom_percentages?.[member.id] || ''}
                    onChange={(event) => setForm((previous) => {
                      const raw = sanitizeIntegerInput(event.target.value);
                      const clamped = raw === '' ? '' : String(Math.min(100, Math.max(0, Number(raw))));
                      return {
                        ...previous,
                        custom_percentages: { ...previous.custom_percentages, [member.id]: clamped },
                      };
                    })}
                    placeholder="0"
                    className="split-suffix-input"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 hidden sm:flex items-center text-sm text-[var(--text-muted)]">%</span>
                </div>
                <span className="w-10 sm:w-16 shrink-0 text-right text-sm font-medium amount-neutral">
                  {computed && computed.amount_owed > 0
                    ? formatCurrency(computed.amount_owed, { precise: true })
                    : <span className="text-[var(--text-muted)]">—</span>}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-start gap-3 border-t border-[var(--border-subtle)] pt-3 text-sm">
          <span className="flex-1 text-[var(--text-secondary)]">
            Totalt
            {percentTotal > 0 && percentDifference !== 0 && (
              <span className={`block text-xs ${diffClass}`}>{diffLabel}</span>
            )}
          </span>
          <span className="w-16 sm:w-20 shrink-0 text-right font-medium amount-neutral">{percentTotal}%</span>
          <span className="w-10 sm:w-16 shrink-0 text-right font-medium amount-neutral">
            {percentSplits.length > 0
              ? formatCurrency(percentSplits.reduce((s, r) => s + r.amount_owed, 0), { precise: true })
              : <span className="text-[var(--text-muted)]">—</span>}
          </span>
        </div>
      </div>
    );
  }

  if (form.split_type === 'equal' || form.split_type === 'all_equal') {
    return (
      <div className="space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4">
        <div className="space-y-3">
          {members.map((member) => {
            const split = equalSplits.find((s) => s.user_id === member.id);
            const isIncluded = split != null;
            const equalTotal = equalSplits.reduce((s, r) => s + r.amount_owed, 0);
            const pct = isIncluded && equalTotal > 0 ? Math.round(split.amount_owed / equalTotal * 100) : null;
            const checked = form.included_users[member.id] !== false;
            const pctLabel = getEqualPctLabel(pct, isIncluded);
            return (
              <div key={member.id} className="flex min-h-[3.375rem] items-center gap-3">
                <UserAvatar
                  user={member}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--app-surface-strong)] text-xs font-semibold text-[var(--text-secondary)] ring-1 ring-[var(--border-subtle)]"
                  initialsClassName=""
                  imageClassName="h-full w-full object-cover"
                />
                <span className="flex-1 truncate text-sm">{getUserDisplayName(member)}</span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setForm((previous) => {
                    const next = { ...previous.included_users, [member.id]: event.target.checked };
                    const anyChecked = members.some((m) => next[m.id] !== false);
                    if (!anyChecked) return previous;
                    return { ...previous, included_users: next };
                  })}
                />
                <span className={`w-16 sm:w-24 shrink-0 text-right text-sm font-medium ${isIncluded ? 'amount-neutral' : 'text-[var(--text-muted)]'}`}>
                  {isIncluded ? formatCurrency(split.amount_owed, { precise: true }) : '0 kr'}
                </span>
                <span className={`w-10 sm:w-14 shrink-0 text-right text-sm font-medium ${isIncluded ? 'amount-neutral' : 'text-[var(--text-muted)]'}`}>
                    {pctLabel}
                </span>
              </div>
            );
          })}
          {!equalSplits.length && null}
        </div>
        {equalSplits.length > 0 && (
          <div className="flex items-center gap-3 border-t border-[var(--border-subtle)] pt-3 text-sm">
            <span className="flex-1 text-[var(--text-secondary)]">Totalt</span>
            <span className="w-16 sm:w-24 shrink-0 text-right font-medium amount-neutral">
              {formatCurrency(equalSplits.reduce((s, r) => s + r.amount_owed, 0), { precise: true })}
            </span>
            <span className="w-10 sm:w-14 shrink-0 text-right font-medium amount-neutral">100%</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4">
      <div className="space-y-3">
        {selectedMembers.map((member) => {
          const owed = Number(form.custom_amounts[member.id] || 0);
          const pct = hasValidAmount && owed > 0 ? Math.round(owed / amount * 100) : null;
          return (
          <div key={member.id} className="flex items-center gap-3">
            <UserAvatar
              user={member}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--app-surface-strong)] text-xs font-semibold text-[var(--text-secondary)] ring-1 ring-[var(--border-subtle)]"
              initialsClassName=""
              imageClassName="h-full w-full object-cover"
            />
            <span className="flex-1 truncate text-sm">{getUserDisplayName(member)}</span>
            <div className="relative w-20 shrink-0">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={form.custom_amounts[member.id] || ''}
                onChange={(event) => setForm((previous) => {
                  const raw = sanitizeIntegerInput(event.target.value);
                  const clamped = raw === '' ? '' : String(Math.min(hasValidAmount ? amount : Infinity, Math.max(0, Number(raw))));
                  return { ...previous, custom_amounts: { ...previous.custom_amounts, [member.id]: clamped } };
                })}
                placeholder="0"
                className="split-suffix-input"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 hidden sm:flex items-center text-sm text-[var(--text-muted)]">kr</span>
            </div>
            <span className="w-10 sm:w-14 shrink-0 text-right text-sm font-medium amount-neutral">
              {pct != null
                ? `${pct}%`
                : <span className="text-[var(--text-muted)]">—</span>}
            </span>
          </div>
          );
        })}
      </div>
      <div className="flex items-start gap-3 border-t border-[var(--border-subtle)] pt-3 text-sm">
        <span className="flex-1 text-[var(--text-secondary)]">
          Totalt
          {hasValidAmount && customDifference !== 0 && (
            <span className={`block text-xs ${getCustomDifferenceClass(hasValidAmount, customDifference)}`}>
              {getCustomDifferenceText(hasValidAmount, customDifference)}
            </span>
          )}
        </span>
        <span className="w-16 sm:w-20 shrink-0 text-right font-medium amount-neutral">
          {formatCurrency(customTotal, { precise: true })}
        </span>
        <span className="w-10 sm:w-14 shrink-0 text-right font-medium amount-neutral">
          {hasValidAmount && customTotal > 0 ? `${Math.round(customTotal / amount * 100)}%` : <span className="text-[var(--text-muted)]">—</span>}
        </span>
      </div>
    </div>
  );
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
  const { amount, selectedMembers, equalSplits, customTotal, customDifference, hasValidAmount, percentTotal, percentSplits, percentDifference } = getSplitSummary(form, members);
  const selectedCategory = categories.find((category) => String(category.id) === String(form.category_id));
  const isCarTripCategory = selectedCategory?.icon === 'car';
  let sharesValid = true;
  if (form.split_type === 'custom') {
    sharesValid = !hasValidAmount || customDifference === 0;
  } else if (form.split_type === 'percent') {
    sharesValid = percentDifference === 0;
  }
  const formValid = form.title.trim() !== ''
    && hasValidAmount
    && form.paid_by_user_id !== ''
    && sharesValid;

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
      <CategorySelector categories={categories} form={form} setForm={setForm} mileageRate={mileageRate} />

      <div className="grid gap-4 md:grid-cols-4">
        <label className="field-label md:col-span-4">
          <span className="sr-only">Titel</span>
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
          <>
            <label className="field-label md:col-span-1">
              <span>Antal mil <span className="text-[var(--text-muted)] font-normal">({mileageRate} kr/mil)</span></span>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={form.distance_mil || ''}
                  onChange={(event) => {
                    const distanceMil = sanitizeIntegerInput(event.target.value);
                    setForm((previous) => getDistanceMilUpdate(previous, distanceMil, mileageRate));
                  }}
                  placeholder="0"
                  style={{ paddingRight: '2.6rem' }}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[var(--text-muted)]">mil</span>
              </div>
            </label>
            <label className="field-label md:col-span-1">
              <span>Belopp</span>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={form.amount}
                  onChange={(event) => {
                    const raw = sanitizeIntegerInput(event.target.value);
                    const amountValue = raw === '' ? '' : String(Math.min(99999, Math.max(1, Number(raw))));
                    setForm((previous) => getAmountUpdate(previous, amountValue, isCarTripCategory, mileageRate));
                  }}
                  placeholder="0"
                  required
                  style={{ paddingRight: '2.4rem' }}
                />
                  <span className="pointer-events-none absolute inset-y-0 right-3 hidden sm:flex items-center text-sm text-[var(--text-muted)]">%</span>
              </div>
            </label>
          </>
        ) : (
          <label className="field-label md:col-span-2">
            <span>Belopp</span>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={form.amount}
                onChange={(event) => {
                  const raw = sanitizeIntegerInput(event.target.value);
                  const amountValue = raw === '' ? '' : String(Math.min(99999, Math.max(1, Number(raw))));
                  setForm((previous) => getAmountUpdate(previous, amountValue, isCarTripCategory, mileageRate));
                }}
                placeholder="0"
                required
                style={{ paddingRight: '2.4rem' }}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[var(--text-muted)]">kr</span>
            </div>
          </label>
        )}

        <label className="field-label md:col-span-2">
          <span>Betald av</span>
          <MemberDropdown
            value={form.paid_by_user_id}
            options={members}
            placeholder="Välj betalare"
            onChange={(selectedValue) => setForm((previous) => ({ ...previous, paid_by_user_id: selectedValue }))}
            ariaLabel="Välj vem som betalade"
          />
        </label>

        <label className="field-label md:col-span-4">
          <span>Datum och tid för utlägget</span>
          <DateTimePicker
            value={form.occurred_at}
            onChange={(value) => setForm((previous) => ({ ...previous, occurred_at: value }))}
          />
        </label>

        <label className="field-label md:col-span-4">
          <span>Anteckningar</span>
          <textarea
            rows="3"
            value={form.notes}
            onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
          />
        </label>
      </div>

      <div className="surface-card space-y-4 p-4">
        <h3 className="m-0 text-base font-semibold">Dela utgiften</h3>

        <SplitTypeDropdown
          value={form.split_type}
          onChange={(v) => setForm((previous) => ({ ...previous, split_type: v }))}
          membersCount={members.length}
        />

        {form.split_type !== 'all_equal' && <SplitDetailsPanel
          form={form}
          amount={amount}
          equalSplits={equalSplits}
          members={members}
          selectedMembers={selectedMembers}
          customDifference={customDifference}
          customTotal={customTotal}
          hasValidAmount={hasValidAmount}
          percentTotal={percentTotal}
          percentSplits={percentSplits}
          percentDifference={percentDifference}
          setForm={setForm}
        />}
      </div>

      {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>{onDelete ? <button type="button" className="btn-danger w-full sm:w-auto" onClick={onDelete} disabled={saving}>Ta bort</button> : null}</div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" className="btn-secondary w-full sm:w-auto" onClick={handleCancel} disabled={saving}>
            Avbryt
          </button>
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={saving || !formValid}>
            {saving ? 'Sparar...' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
