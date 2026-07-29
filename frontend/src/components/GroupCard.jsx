import { ArrowRight, Users } from 'lucide-react';
import { formatCurrency } from '../lib/format.js';

function getBalanceState(balance) {
  if (balance > 0) {
    return {
      badgeClass: 'positive',
      amountClass: 'amount-positive',
      label: 'Du har pengar att få',
    };
  }

  if (balance < 0) {
    return {
      badgeClass: 'negative',
      amountClass: 'amount-negative',
      label: 'Du är skyldig',
    };
  }

  return {
    badgeClass: 'neutral',
    amountClass: 'amount-neutral',
    label: 'Allt är balanserat',
  };
}

export default function GroupCard({ group, onOpen }) {
  const state = getBalanceState(group.current_user_balance || 0);

  return (
    <button
      type="button"
      className="surface-card flex w-full flex-col gap-5 p-5 text-left transition hover:-translate-y-0.5"
      onClick={() => onOpen(group.id)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <span className={`status-badge ${state.badgeClass}`}>{state.label}</span>
          <div>
            <h3 className="m-0 text-lg font-semibold">{group.name}</h3>
            <p className="mt-1 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Users className="h-4 w-4" />
              {group.member_count} medlemmar
            </p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
      </div>

      <div className="flex items-end justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
        <div>
          <p className="m-0 text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Din balans</p>
          <p className={`mt-2 text-xl font-semibold ${state.amountClass}`}>
            {formatCurrency(Math.abs(group.current_user_balance || 0), { precise: true })}
          </p>
        </div>
        <span className="text-sm font-medium text-[var(--text-secondary)]">Öppna grupp</span>
      </div>
    </button>
  );
}
