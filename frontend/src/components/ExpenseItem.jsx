import { getCategoryIcon } from '../lib/expenseCategories.js';
import { formatCurrency, formatDateTime } from '../lib/format.js';
import { getUserDisplayName, getUserInitials } from '../lib/users.js';

export default function ExpenseItem({ expense, onEdit, readOnly = false }) {
  const uniqueParticipants = Array.from(
    new Map(
      [{ user_id: expense.paid_by_user_id, full_name: expense.paid_by_full_name, initials: expense.paid_by_initials }, ...expense.splits].map((item) => [
        item.user_id,
        item,
      ]),
    ).values(),
  ).sort((a, b) => {
    const initialsA = getUserInitials(a);
    const initialsB = getUserInitials(b);
    return initialsA.localeCompare(initialsB, 'sv');
  });
  const payer = { full_name: expense.paid_by_full_name, initials: expense.paid_by_initials };
  const CategoryIcon = getCategoryIcon(expense.category_icon);

  const handleKeyDown = (event) => {
    if (readOnly) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onEdit(expense.id);
    }
  };

  return (
    <article
      className={[
        'flex flex-col gap-4 border-b border-[var(--border-subtle)] px-5 py-5 transition last:border-b-0 sm:flex-row sm:items-center sm:justify-between',
        readOnly ? '' : 'cursor-pointer hover:bg-[var(--app-surface-muted)] focus:outline-none focus-visible:bg-[var(--app-surface-muted)]',
      ].join(' ')}
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? undefined : 0}
      onClick={readOnly ? undefined : () => onEdit(expense.id)}
      onKeyDown={readOnly ? undefined : handleKeyDown}
    >
      <div className="flex items-center gap-3">
        <div title={getUserDisplayName(payer)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--app-surface-muted)] text-sm font-semibold text-[var(--text-primary)]">
          {getUserInitials(payer)}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 overflow-hidden">
            <CategoryIcon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <h3 className="m-0 text-base font-semibold truncate">{expense.title}</h3>
          </div>
          {expense.notes ? <p className="m-0 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{expense.notes}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            {uniqueParticipants.map((participant) => (
              <span
                key={participant.user_id}
                title={getUserDisplayName(participant)}
                className="inline-flex items-center justify-center px-0.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] text-[9px] font-semibold text-[var(--text-primary)]">
                  {getUserInitials(participant)}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-[9.5rem_6.5rem] items-center gap-4 self-center text-right">
        <p className="m-0 whitespace-nowrap text-xs tabular-nums text-[var(--text-muted)]">{formatDateTime(expense.occurred_at || expense.created_at)}</p>
        <p className="m-0 text-lg font-semibold tabular-nums amount-neutral">{formatCurrency(expense.amount, { precise: true })}</p>
      </div>
    </article>
  );
}
