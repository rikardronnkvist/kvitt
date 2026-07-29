import { PencilLine, Receipt } from 'lucide-react';
import { formatCurrency, formatDateTime } from '../lib/format.js';

function getInitials(username) {
  return username.slice(0, 2).toUpperCase();
}

export default function ExpenseItem({ expense, onEdit }) {
  const uniqueParticipants = Array.from(
    new Map(
      [{ username: expense.paid_by_username }, ...expense.splits].map((item) => [
        item.username,
        item,
      ]),
    ).values(),
  );

  return (
    <article className="flex flex-col gap-4 border-b border-[var(--border-subtle)] px-5 py-5 last:border-b-0 sm:flex-row sm:items-start">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--app-surface-muted)] text-sm font-semibold text-[var(--text-primary)]">
        {getInitials(expense.paid_by_username)}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-[var(--text-muted)]" />
              <h3 className="m-0 text-base font-semibold">{expense.title}</h3>
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {expense.paid_by_username} betalade för {expense.splits.map((split) => split.username).join(', ')}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="m-0 text-lg font-semibold amount-neutral">{formatCurrency(expense.amount, { precise: true })}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{formatDateTime(expense.created_at)}</p>
          </div>
        </div>

        {expense.notes ? <p className="m-0 text-sm text-[var(--text-secondary)]">{expense.notes}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {uniqueParticipants.map((participant) => (
              <span
                key={participant.username}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--app-surface-strong)] text-[10px] font-semibold text-[var(--text-primary)]">
                  {getInitials(participant.username)}
                </span>
                {participant.username}
              </span>
            ))}
          </div>
          <button type="button" className="btn-secondary" onClick={() => onEdit(expense.id)}>
            <PencilLine className="h-4 w-4" />
            Redigera
          </button>
        </div>
      </div>
    </article>
  );
}
