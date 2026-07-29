import { ArrowRight, Users } from 'lucide-react';
import { formatCurrency } from '../lib/format.js';
import { getThemeForGroup } from '../lib/groupTheme.js';

function getBalanceState(balance) {
  if (balance > 0) {
    return {
      amountClass: 'amount-positive',
    };
  }

  if (balance < 0) {
    return {
      amountClass: 'amount-negative',
    };
  }

  return {
    amountClass: 'amount-neutral',
  };
}

export default function GroupCard({ group, onOpen }) {
  const state = getBalanceState(group.current_user_balance || 0);
  const theme = getThemeForGroup(group);
  const isArchived = Boolean(group.archived_at);
  const cardStyle = isArchived
    ? { background: '#374151', borderColor: '#4b5563' }
    : { background: theme.bgSoft, borderColor: theme.borderSoft };
  const topBarStyle = { background: isArchived ? '#6b7280' : theme.base };
  return (
    <button
      type="button"
      className="surface-card flex w-full flex-col gap-5 overflow-hidden p-0 text-left transition hover:-translate-y-0.5"
      onClick={() => onOpen(group.id)}
      style={cardStyle}
    >
      <div
        className="h-1 w-full"
        style={topBarStyle}
      />
      <div className="flex flex-col gap-5 px-5 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            {isArchived ? (
              <span className="inline-flex items-center rounded-full border border-[#6b7280] bg-[#4b5563] px-2.5 py-0.5 text-xs font-medium text-[#f3f4f6]">
                Arkiverad
              </span>
            ) : null}
            <div>
              <h3 className={`m-0 text-lg font-semibold ${isArchived ? 'text-gray-100' : ''}`}>{group.name}</h3>
              <p className={`mt-1 flex items-center gap-2 text-sm ${isArchived ? 'text-gray-300' : 'text-[var(--text-secondary)]'}`}>
                <Users className="h-4 w-4" />
                {group.member_count} medlemmar
              </p>
            </div>
          </div>
          <ArrowRight className={`h-4 w-4 shrink-0 ${isArchived ? 'text-gray-300' : 'text-[var(--text-muted)]'}`} />
        </div>

        {!isArchived ? (
          <div className="flex items-end gap-3 border-t pt-4" style={{ borderColor: theme.borderSoft }}>
            <div>
              <p className="m-0 text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Din balans</p>
              <p className={`mt-2 text-xl font-semibold ${state.amountClass}`}>
                {formatCurrency(group.current_user_balance || 0, { precise: true })}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </button>
  );
}
