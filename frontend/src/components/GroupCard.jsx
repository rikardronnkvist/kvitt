import { ArrowRight, Users } from 'lucide-react';
import { formatCurrency } from '../lib/format.js';
import { getThemeForGroup } from '../lib/groupTheme.js';

function getBalanceState(balance) {
  if (balance > 0) {
    return {
      amountClass: 'amount-positive',
      label: 'Du har pengar att få',
    };
  }

  if (balance < 0) {
    return {
      amountClass: 'amount-negative',
      label: 'Du är skyldig',
    };
  }

  return {
    amountClass: 'amount-neutral',
    label: 'Allt är balanserat',
  };
}

export default function GroupCard({ group, onOpen }) {
  const state = getBalanceState(group.current_user_balance || 0);
  const theme = getThemeForGroup(group);

  return (
    <button
      type="button"
      className="surface-card flex w-full flex-col gap-5 overflow-hidden p-0 text-left transition hover:-translate-y-0.5"
      onClick={() => onOpen(group.id)}
    >
      <div
        className="h-1 w-full"
        style={{ background: theme.base }}
      />
      <div className="flex flex-col gap-5 px-5 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ background: theme.bgSoft, color: theme.textStrong, border: `1px solid ${theme.borderSoft}` }}
            >
              {state.label}
            </span>
            <div>
              <h3 className="m-0 text-lg font-semibold">{group.name}</h3>
              <p className="mt-1 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <Users className="h-4 w-4" />
                {group.member_count} medlemmar
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        </div>

        <div className="flex items-end gap-3 border-t border-[var(--border-subtle)] pt-4">
          <div>
            <p className="m-0 text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Din balans</p>
            <p className={`mt-2 text-xl font-semibold ${state.amountClass}`}>
              {formatCurrency(group.current_user_balance || 0, { precise: true })}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}
