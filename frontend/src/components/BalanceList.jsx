import { ArrowRight } from 'lucide-react';
import { formatCurrency } from '../lib/format.js';
import { getUserDisplayName } from '../lib/users.js';

export default function BalanceList({ balances, nested = false }) {
  if (!balances.length) {
    return <p className="m-0 text-sm text-[var(--text-secondary)]">Inga utestående saldon just nu.</p>;
  }

  return (
    <div className={nested ? 'space-y-3' : 'surface-card space-y-3 p-5'}>
      {balances.map((balance, index) => (
        <div
          key={`${balance.from.id}-${balance.to.id}-${index}`}
          className="flex items-center justify-between gap-3 py-1.5 text-sm"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{getUserDisplayName(balance.from)}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <span className="truncate text-[var(--text-secondary)]">{getUserDisplayName(balance.to)}</span>
          </div>
          <span className="shrink-0 font-semibold amount-neutral">{formatCurrency(balance.amount, { precise: true })}</span>
        </div>
      ))}
    </div>
  );
}
