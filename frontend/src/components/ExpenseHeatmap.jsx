import { useMemo } from 'react';
import { Users } from 'lucide-react';
import UserAvatar from './UserAvatar.jsx';
import { getCategoryIcon } from '../lib/expenseCategories.js';
import { buildHeatmap } from '../lib/heatmap.js';
import { t } from '../lib/i18n.js';

const LEVELS = [1, 2, 3, 4, 5];

function formatAmount(value) {
  return Math.round(Number(value) || 0).toLocaleString('sv-SE');
}

function parseLocalDate(value) {
  return new Date(`${value}T12:00:00`);
}

function formatDateRange(start, end) {
  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end);
  const format = (date, includeYear = false) => date.toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
  const includeYear = startDate.getFullYear() !== endDate.getFullYear();
  return start === end ? format(startDate, includeYear) : `${format(startDate)}–${format(endDate, includeYear)}`;
}

function getCellLevel(value, max) {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(LEVELS.length, Math.ceil(Math.sqrt(value / max) * LEVELS.length));
}

function RowLabel({ row, dimension }) {
  if (dimension === 'category') {
    const Icon = getCategoryIcon(row.iconId);
    return <Icon aria-hidden="true" className="h-4 w-4 text-[var(--text-secondary)]" />;
  }

  if (!row.member) return <Users aria-hidden="true" className="h-4 w-4 text-[var(--text-secondary)]" />;
  return (
    <UserAvatar
      user={row.member}
      className="grid h-6 w-6 place-items-center overflow-hidden rounded-full bg-[var(--app-surface-muted)]"
      imageClassName="h-full w-full object-cover"
      initialsClassName="text-[9px] font-semibold text-[var(--text-secondary)]"
    />
  );
}

function HeatmapView({ data, dimension, title }) {
  const headingId = `expense-heatmap-${dimension}-heading`;

  return (
    <section className="min-w-0" aria-labelledby={headingId}>
      <h3 id={headingId} className="m-0 text-sm font-semibold">{title}</h3>
      <div className="expense-heatmap-scroll mt-3" role="region" aria-label={title} tabIndex="0">
        <table className="expense-heatmap-table">
          <thead>
            <tr>
              <th className="expense-heatmap-sticky expense-heatmap-corner" scope="col" />
              {data.columns.map((column) => (
                <th key={column.key} scope="col" className="expense-heatmap-period">
                  {column.label}
                </th>
              ))}
              <th scope="col" className="expense-heatmap-total">{t('groupStatistics.heatmapTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" aria-label={row.label} className="expense-heatmap-sticky expense-heatmap-row-label" title={row.label}>
                  <RowLabel row={row} dimension={dimension} />
                </th>
                {row.values.map((value, index) => {
                  const column = data.columns[index];
                  const period = data.granularity === 'day' ? column.label : formatDateRange(column.start, column.end);
                  const tooltip = t('groupStatistics.heatmapTooltip', {
                    row: row.label,
                    period,
                    amount: formatAmount(value),
                    count: row.counts[index],
                  });
                  return (
                    <td key={column.key} className={`expense-heatmap-cell${value ? ` level-${getCellLevel(value, data.max)}` : ' level-0'}`} title={tooltip}>
                      {value ? formatAmount(value) : '–'}
                    </td>
                  );
                })}
                <td className="expense-heatmap-total">{formatAmount(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </section>
  );
}

export default function ExpenseHeatmap({ expenses, members }) {
  const categoryData = useMemo(() => buildHeatmap(expenses, { dimension: 'category', members }), [expenses, members]);
  const memberData = useMemo(() => buildHeatmap(expenses, { dimension: 'member', members }), [expenses, members]);
  const hasExpenses = expenses.length > 0;

  return (
    <article className="surface-card min-w-0 p-5">
      <h2 className="m-0 text-base font-semibold">{t('groupStatistics.heatmapTitle')}</h2>
      {!hasExpenses ? (
        <p className="mb-0 mt-5 text-sm text-[var(--text-secondary)]">{t('groupStatistics.heatmapEmpty')}</p>
      ) : (
        <div className="mt-5 space-y-6">
          <HeatmapView
            data={categoryData}
            dimension="category"
            title={t('groupStatistics.heatmapCategory')}
          />
          <HeatmapView
            data={memberData}
            dimension="member"
            title={t('groupStatistics.heatmapMember')}
          />
        </div>
      )}
    </article>
  );
}