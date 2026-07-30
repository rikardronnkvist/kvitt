import { ArrowRight } from 'lucide-react';
import { formatCurrency } from '../lib/format.js';
import { getUserDisplayName } from '../lib/users.js';

export default function BalanceList({ balances, nested = false, onSelect }) {
  if (!balances.length) {
    return <p className="m-0 text-sm text-[var(--text-secondary)]">Inga utestående saldon just nu.</p>;
  }

  return (
    <div className={nested ? 'space-y-3' : 'surface-card space-y-3 p-5'}>
      {balances.map((balance, index) => (
        <div
          key={`${balance.from.id}-${balance.to.id}-${index}`}
          onClick={onSelect ? () => onSelect(balance) : undefined}
          className={[
            'flex items-center justify-between gap-3 py-1.5 text-sm',
            onSelect ? 'cursor-pointer rounded-lg px-2 -mx-2 transition hover:bg-[var(--app-surface-muted)]' : '',
          ].join(' ')}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex flex-col">
              <span className="truncate font-medium">{getUserDisplayName(balance.from)}</span>
              {balance.from.is_placeholder ? (
                <span className="text-xs text-[var(--text-muted)]">Ej ansluten</span>
              ) : null}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <span className="flex flex-col">
              <span className="truncate text-[var(--text-secondary)]">{getUserDisplayName(balance.to)}</span>
              {balance.to.is_placeholder ? (
                <span className="text-xs text-[var(--text-muted)]">Ej ansluten</span>
              ) : null}
            </span>
          </div>
          <span className="shrink-0 font-semibold amount-neutral">{formatCurrency(balance.amount, { precise: true })}</span>
        </div>
      ))}
    </div>
  );
}
