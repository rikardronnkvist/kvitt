import { ArrowRight } from 'lucide-react';
import { formatCurrency } from '../lib/format.js';
import { getUserDisplayName } from '../lib/users.js';

export default function BalanceList({ balances, nested = false, onSelect, isSelected }) {
  if (!balances.length) {
    return <p className="m-0 text-sm text-[var(--text-secondary)]">Inga utestående saldon just nu.</p>;
  }

  return (
    <div className={nested ? 'space-y-3' : 'surface-card space-y-3 p-5'}>
      {balances.map((balance, index) => {
        const key = `${balance.from.id}-${balance.to.id}-${index}`;
        const content = (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{getUserDisplayName(balance.from)}</span>
                {balance.from.is_placeholder ? (
                  <span className="text-xs text-[var(--text-muted)]">Ej ansluten</span>
                ) : null}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[var(--text-secondary)]">{getUserDisplayName(balance.to)}</span>
                {balance.to.is_placeholder ? (
                  <span className="text-xs text-[var(--text-muted)]">Ej ansluten</span>
                ) : null}
              </span>
            </div>
            <span className="shrink-0 font-semibold amount-neutral">{formatCurrency(balance.amount, { precise: true })}</span>
          </>
        );

        if (onSelect) {
          const selected = typeof isSelected === 'function' ? isSelected(balance) : false;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(balance)}
              aria-pressed={selected}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border px-2 py-1.5 text-left text-sm transition ${selected ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_12%,white)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--accent)_35%,transparent)]' : 'border-transparent hover:bg-[var(--app-surface-muted)]'}`}
            >
              {content}
            </button>
          );
        }

        return (
          <div key={key} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            {content}
          </div>
        );
      })}
    </div>
  );
}
