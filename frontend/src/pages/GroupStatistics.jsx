import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { get } from '../api/client.js';
import UserAvatar from '../components/UserAvatar.jsx';
import { getCategoryIcon } from '../lib/expenseCategories.js';
import { formatCurrency } from '../lib/format.js';
import { getThemeForGroup } from '../lib/groupTheme.js';
import { getUserAvatarUrl, getUserDisplayName, getUserInitials } from '../lib/users.js';
import { t } from '../lib/i18n.js';

const PIE_COLORS = ['#0F766E', '#4F6D8A', '#B25D3D', '#5F7D4E', '#6E4E73', '#B38A2E', '#5C6B73'];
const TIMELINE_GRANULARITY_OPTIONS = [
  { value: 'day', label: t('groupStatistics.day') },
  { value: 'week', label: t('groupStatistics.week') },
  { value: 'month', label: t('groupStatistics.month') },
  { value: 'year', label: t('groupStatistics.year') },
];
const TIMELINE_DATA_OPTIONS = [
  { value: 'both', label: t('groupStatistics.both') },
  { value: 'expenses', label: t('groupStatistics.expenses') },
  { value: 'transfers', label: t('groupStatistics.settlements') },
];

function hexToRgba(hex, alpha) {
  const normalized = String(hex || '').replace('#', '');
  if (normalized.length !== 6) {
    return `rgba(148, 163, 184, ${alpha})`;
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatShortSek(value) {
  const amount = Number(value) || 0;
  return `${Math.round(amount).toLocaleString('sv-SE')} kr`;
}

function getNiceAxisMax(value, { allowOnePointFive = false } = {}) {
  const numeric = Number(value) || 0;
  if (numeric <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(numeric));
  const normalized = numeric / magnitude;
  let niceNormalized;

  if (normalized <= 1) {
    niceNormalized = 1;
  } else if (allowOnePointFive && normalized <= 1.5) {
    niceNormalized = 1.5;
  } else if (normalized <= 2) {
    niceNormalized = 2;
  } else if (normalized <= 5) {
    niceNormalized = 5;
  } else {
    niceNormalized = 10;
  }

  return niceNormalized * magnitude;
}

function formatRangeLabel(minDate, maxDate) {
  if (!minDate || !maxDate) return t('groupStatistics.noPeriod');
  const toLabel = (dateValue) => {
    const date = new Date(dateValue);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}/${day}/${date.getFullYear()}`;
  };
  return `${toLabel(minDate)} - ${toLabel(maxDate)}`;
}

function buildTotals(entries, keyResolver, valueResolver) {
  const totals = new Map();
  for (const item of entries) {
    const key = keyResolver(item);
    const value = Number(valueResolver(item) || 0);
    totals.set(key, (totals.get(key) || 0) + value);
  }
  return totals;
}

function startOfPeriod(date, granularity) {
  const periodDate = new Date(date);
  periodDate.setHours(0, 0, 0, 0);

  if (granularity === 'day') {
    return periodDate;
  }

  if (granularity === 'year') {
    periodDate.setMonth(0, 1);
    return periodDate;
  }

  if (granularity === 'month') {
    periodDate.setDate(1);
    return periodDate;
  }

  const day = periodDate.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  periodDate.setDate(periodDate.getDate() + shift);
  return periodDate;
}

function addPeriod(date, granularity) {
  const next = new Date(date);
  if (granularity === 'day') {
    next.setDate(next.getDate() + 1);
    return next;
  }
  if (granularity === 'year') {
    next.setFullYear(next.getFullYear() + 1);
    return next;
  }
  if (granularity === 'month') {
    next.setMonth(next.getMonth() + 1);
    return next;
  }
  next.setDate(next.getDate() + 7);
  return next;
}

function periodKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getIsoWeekInfo(date) {
  const isoDate = new Date(date);
  isoDate.setHours(0, 0, 0, 0);
  const day = isoDate.getDay() || 7;
  isoDate.setDate(isoDate.getDate() + 4 - day);
  const yearStart = new Date(isoDate.getFullYear(), 0, 1);
  const week = Math.ceil((((isoDate - yearStart) / 86400000) + 1) / 7);
  return { week, year: isoDate.getFullYear() };
}

function formatPeriodLabel(date, granularity) {
  if (granularity === 'day') {
    return date.toLocaleDateString('sv-SE', { day: '2-digit', month: 'short' });
  }
  if (granularity === 'year') {
    return String(date.getFullYear());
  }
  if (granularity === 'month') {
    return date.toLocaleDateString('sv-SE', { month: 'short', year: 'numeric' });
  }
  const iso = getIsoWeekInfo(date);
  return `v.${iso.week} ${iso.year}`;
}

function getAutomaticTimelineGranularity(expenses, settlements, dataMode = 'both') {
  const includeExpenses = dataMode === 'both' || dataMode === 'expenses';
  const includeTransfers = dataMode === 'both' || dataMode === 'transfers';

  const timestamps = [
    ...(includeExpenses ? expenses.map((expense) => expense.occurred_at || expense.created_at) : []),
    ...(includeTransfers ? settlements.map((settlement) => settlement.settled_at) : []),
  ]
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .map((date) => date.getTime());

  if (!timestamps.length) {
    return 'month';
  }

  const newestTimestamp = Math.max(...timestamps);
  const oldestTimestamp = Math.min(...timestamps);
  const rangeDays = Math.ceil((newestTimestamp - oldestTimestamp) / 86400000);

  if (rangeDays <= 45) {
    return 'day';
  }

  const now = new Date();

  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  if (oldestTimestamp >= threeMonthsAgo.getTime()) {
    return 'week';
  }

  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  if (oldestTimestamp >= oneYearAgo.getTime()) {
    return 'month';
  }

  return 'year';
}

function toPieData(entries, { sortByValue = true } = {}) {
  const filtered = entries
    .filter((entry) => Number(entry.value) > 0);

  const ordered = sortByValue
    ? [...filtered].sort((a, b) => b.value - a.value)
    : filtered;

  return ordered
    .map((entry, index) => ({
      ...entry,
      color: PIE_COLORS[index % PIE_COLORS.length],
    }));
}

function getTimelineAxisLabels(dataMode) {
  let amountAxisLabel = t('groupStatistics.expensesAndSettlements');
  if (dataMode === 'expenses') {
    amountAxisLabel = t('groupStatistics.totalExpenses');
  } else if (dataMode === 'transfers') {
    amountAxisLabel = t('groupStatistics.totalSettlements');
  }

  let countAxisLabel = t('groupStatistics.eventCount');
  if (dataMode === 'expenses') {
    countAxisLabel = t('groupStatistics.expenseCount');
  } else if (dataMode === 'transfers') {
    countAxisLabel = t('groupStatistics.settlementCount');
  }

  return { amountAxisLabel, countAxisLabel };
}

function getMinLabelSpacing(granularity) {
  if (granularity === 'day') {
    return 66;
  }
  if (granularity === 'week') {
    return 90;
  }
  if (granularity === 'month') {
    return 70;
  }
  return 48;
}

function getTimelineSingleBarFill(dataMode) {
  if (dataMode === 'expenses') {
    return 'rgba(17, 24, 39, 0.68)';
  }
  return 'rgba(15, 118, 110, 0.72)';
}

function getOverviewRowBackground(index) {
  if (index % 2 === 0) {
    return 'color-mix(in srgb, var(--app-surface-strong) 80%, transparent)';
  }
  return 'color-mix(in srgb, var(--app-surface-muted) 70%, transparent)';
}

function getBalanceClass(balance) {
  if (balance > 0) {
    return 'amount-positive';
  }
  if (balance < 0) {
    return 'amount-negative';
  }
  return 'amount-neutral';
}

function getShownLabelIndexes(periodsLength, stepX, minLabelSpacing) {
  const maxVisibleLabels = Math.max(2, Math.floor((stepX * Math.max(periodsLength, 1)) / minLabelSpacing));
  const labelInterval = Math.max(1, Math.ceil(periodsLength / maxVisibleLabels));
  const shownLabelIndexes = new Set();

  for (let index = 0; index < periodsLength; index += labelInterval) {
    shownLabelIndexes.add(index);
  }

  const lastIndex = periodsLength - 1;
  const previousShownIndex = Array.from(shownLabelIndexes).sort((a, b) => a - b).at(-1);
  if (lastIndex >= 0 && (previousShownIndex == null || (lastIndex - previousShownIndex) * stepX >= (minLabelSpacing * 0.8))) {
    shownLabelIndexes.add(lastIndex);
  }

  return shownLabelIndexes;
}

function buildCountPoints(periods, margin, stepX, chartHeight, maxCount) {
  return periods.map((item, index) => {
    const x = margin.left + stepX * index + (stepX / 2);
    const y = margin.top + chartHeight - ((Number(item.count || 0) / maxCount) * chartHeight);
    return { x, y, value: Number(item.count || 0), key: item.key };
  });
}

function StatisticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="surface-card p-6">
        <div className="skeleton h-5 w-32 rounded-md" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="surface-card space-y-4 p-5">
            <div className="skeleton h-5 w-40 rounded-md" />
            <div className="skeleton h-40 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineChart({ periods, granularity, onGranularityChange, dataMode, onDataModeChange, theme }) {
  const width = 760;
  const height = 280;
  const margin = { top: 14, right: 12, bottom: 44, left: 58 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const rawMaxAmount = Math.max(...periods.map((item) => item.amount), 1);
  const maxAmount = getNiceAxisMax(rawMaxAmount, { allowOnePointFive: true });
  const rawMaxCount = Math.max(...periods.map((item) => item.count || 0), 1);
  const maxCount = getNiceAxisMax(rawMaxCount);
  const barWidth = Math.min(40, chartWidth / Math.max(periods.length * 1.8, 1));
  const stepX = chartWidth / Math.max(periods.length, 1);
  const minLabelSpacing = getMinLabelSpacing(granularity);
  const shownLabelIndexes = getShownLabelIndexes(periods.length, stepX, minLabelSpacing);

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const countPoints = buildCountPoints(periods, margin, stepX, chartHeight, maxCount);
  const countPath = countPoints.map((point) => `${point.x},${point.y}`).join(' ');
  const isCombinedMode = dataMode === 'both';
  const { amountAxisLabel, countAxisLabel } = getTimelineAxisLabels(dataMode);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 hidden text-sm font-semibold sm:block">{t('groupStatistics.timeline')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span>{t('groupStatistics.dataLabel')}</span>
            <select
              className="w-auto min-w-[7rem] rounded-md border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-2 py-1 text-xs text-[var(--text-primary)]"
              value={dataMode}
              onChange={(event) => onDataModeChange(event.target.value)}
              aria-label={t('groupStatistics.selectTimelineDataAria')}
            >
              {TIMELINE_DATA_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span>{t('groupStatistics.showLabel')}</span>
            <select
              className="w-auto min-w-[6rem] rounded-md border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-2 py-1 text-xs text-[var(--text-primary)]"
              value={granularity}
              onChange={(event) => onGranularityChange(event.target.value)}
              aria-label={t('groupStatistics.selectTimelineGranularityAria')}
            >
              {TIMELINE_GRANULARITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div
        className="rounded-lg border p-3"
        style={{
          borderColor: theme?.borderSoft || 'var(--border-subtle)',
          background: theme?.bgSoft || 'var(--app-surface-muted)',
        }}
      >
        <div className="grid grid-cols-[40px_minmax(0,1fr)_40px] items-stretch gap-2">
          <div className="flex items-center justify-center text-[11px] text-[var(--text-secondary)]" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            {isCombinedMode ? (
              <span className="inline-flex flex-col items-start gap-1 leading-tight">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[rgba(17,24,39,0.68)]" aria-hidden="true" />
                  <span>{t('groupStatistics.expenses')}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[rgba(15,118,110,0.72)]" aria-hidden="true" />
                  <span>{t('groupStatistics.settlements')}</span>
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span
                  className={`h-2.5 w-2.5 rounded-sm ${dataMode === 'expenses' ? 'bg-[rgba(17,24,39,0.68)]' : 'bg-[rgba(15,118,110,0.72)]'}`}
                  aria-hidden="true"
                />
                {amountAxisLabel}
              </span>
            )}
          </div>
          <svg viewBox={`0 0 ${width} ${height}`} className="h-[250px] w-full" role="img" aria-label={t('groupStatistics.timelineChartAria')}>
            {yTicks.map((tick) => {
              const y = margin.top + (1 - tick) * chartHeight;
              const value = tick * maxAmount;
              return (
                <g key={tick}>
                  <line
                    x1={margin.left}
                    x2={width - margin.right}
                    y1={y}
                    y2={y}
                    stroke="rgba(17, 24, 39, 0.12)"
                    strokeDasharray={tick === 0 ? '0' : '4 5'}
                  />
                  <text
                    x={margin.left - 10}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-[var(--text-muted)] text-[11px]"
                  >
                    {formatShortSek(value)}
                  </text>
                  <text
                    x={width - margin.right + 10}
                    y={y + 4}
                    textAnchor="start"
                    className="fill-[var(--text-muted)] text-[11px]"
                  >
                    {Math.round(tick * maxCount)} st
                  </text>
                </g>
              );
            })}

            {periods.map((item, index) => {
              const xCenter = margin.left + stepX * index + (stepX / 2);
              const barHeight = Math.max(3, (item.amount / maxAmount) * chartHeight);
              const y = margin.top + chartHeight - barHeight;
              const shouldShowLabel = shownLabelIndexes.has(index);
              const safeTotal = Math.max(0, item.amount);
              const expenseSegmentHeight = safeTotal > 0 ? (barHeight * (item.expenseAmount / safeTotal)) : 0;
              const transferSegmentHeight = safeTotal > 0 ? (barHeight * (item.transferAmount / safeTotal)) : 0;
              const transferY = y;
              const expenseY = y + transferSegmentHeight;
              return (
                <g key={item.key}>
                  {isCombinedMode ? (
                    <>
                      {transferSegmentHeight > 0 ? (
                        <rect
                          x={xCenter - (barWidth / 2)}
                          y={transferY}
                          width={barWidth}
                          height={transferSegmentHeight}
                          rx="3"
                          fill="rgba(15, 118, 110, 0.72)"
                        />
                      ) : null}
                      {expenseSegmentHeight > 0 ? (
                        <rect
                          x={xCenter - (barWidth / 2)}
                          y={expenseY}
                          width={barWidth}
                          height={expenseSegmentHeight}
                          rx="3"
                          fill="rgba(17, 24, 39, 0.68)"
                        />
                      ) : null}
                    </>
                  ) : (
                    <rect
                      x={xCenter - (barWidth / 2)}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      rx="3"
                      fill={getTimelineSingleBarFill(dataMode)}
                    />
                  )}
                  {shouldShowLabel ? (
                    <text
                      x={xCenter}
                      y={height - 18}
                      textAnchor="middle"
                      className="fill-[var(--text-secondary)] text-[12px]"
                    >
                      {item.label}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {countPath ? (
              <g>
                <polyline
                  points={countPath}
                  fill="none"
                  stroke="rgba(95, 125, 78, 0.95)"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {countPoints.map((point) => (
                  <circle
                    key={point.key}
                    cx={point.x}
                    cy={point.y}
                    r="2.8"
                    fill="rgba(95, 125, 78, 1)"
                  />
                ))}
              </g>
            ) : null}
          </svg>
          <div className="flex items-center justify-center text-[11px] text-[var(--text-secondary)]" style={{ writingMode: 'vertical-rl' }}>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="h-[2px] w-4 rounded-full bg-[rgba(95,125,78,0.95)]" aria-hidden="true" />
              {countAxisLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PieCard({
  title,
  entries,
  formatValue = (value) => formatCurrency(value, { precise: true }),
  highlightedLabel,
  onHighlightChange,
}) {
  const [localHoveredLabel, setLocalHoveredLabel] = useState('');
  const hoveredLabel = highlightedLabel !== undefined ? highlightedLabel : localHoveredLabel;
  const setHoveredLabel = (label) => {
    if (onHighlightChange) {
      onHighlightChange(label);
      return;
    }
    setLocalHoveredLabel(label);
  };
  const total = entries.reduce((sum, item) => sum + item.value, 0);
  const hasHover = Boolean(hoveredLabel);
  const donutSize = 180;
  const innerSize = 108;
  const outerRadius = donutSize / 2;
  const innerRadius = innerSize / 2;
  const segments = useMemo(() => {
    let running = 0;
    return entries.map((entry) => {
      const start = running;
      const slice = total > 0 ? ((entry.value / total) * 100) : 0;
      running += slice;
      return {
        label: entry.label,
        start,
        end: running,
      };
    });
  }, [entries, total]);

  const handleDonutHover = (event) => {
    if (!segments.length) {
      setHoveredLabel('');
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const distance = Math.hypot(dx, dy);

    if (distance < innerRadius || distance > outerRadius) {
      setHoveredLabel('');
      return;
    }

    const angle = (Math.atan2(dy, dx) * (180 / Math.PI) + 90 + 360) % 360;
    const percent = (angle / 360) * 100;
    const segment = segments.find((item, index) => {
      const isLast = index === segments.length - 1;
      if (isLast) {
        return percent >= item.start && percent <= item.end;
      }
      return percent >= item.start && percent < item.end;
    });

    setHoveredLabel(segment?.label || '');
  };

  const gradient = entries.length
    ? `conic-gradient(${entries.map((entry, index) => {
      const start = entries.slice(0, index).reduce((sum, item) => sum + ((item.value / total) * 100), 0);
      const end = start + ((entry.value / total) * 100);
      const color = hasHover && entry.label !== hoveredLabel
        ? hexToRgba(entry.color, 0.24)
        : entry.color;
      return `${color} ${start}% ${end}%`;
    }).join(', ')})`
    : 'conic-gradient(#d1d5db 0 100%)';

  return (
    <article className="surface-card p-5">
      <p className="m-0 text-base font-semibold">{title}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
        <div
          className="mx-auto grid h-[180px] w-[180px] place-items-center rounded-full"
          style={{ background: gradient }}
          onMouseMove={handleDonutHover}
          onMouseLeave={() => setHoveredLabel('')}
          onTouchMove={handleDonutHover}
          onTouchEnd={() => setHoveredLabel('')}
          role="img"
          aria-label={`${title} tårtdiagram`}
        >
          <div className="h-[108px] w-[108px] rounded-full bg-[var(--app-surface-strong)]" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          {entries.length ? entries.map((entry) => {
            const isActive = hoveredLabel === entry.label;
            return (
            <button
              key={entry.label}
              type="button"
              className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 text-sm transition ${isActive ? 'bg-[var(--app-surface-muted)]' : ''}`}
              onMouseEnter={() => setHoveredLabel(entry.label)}
              onMouseLeave={() => setHoveredLabel('')}
              onFocus={() => setHoveredLabel(entry.label)}
              onBlur={() => setHoveredLabel('')}
              onClick={() => setHoveredLabel(entry.label)}
            >
              <span className="inline-flex min-w-0 items-center gap-2 text-[var(--text-secondary)]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: entry.color }} />
                <span className="truncate">{entry.label}</span>
              </span>
              <span className="min-w-[7ch] whitespace-nowrap text-right font-semibold tabular-nums amount-neutral">{formatValue(entry.value)}</span>
            </button>
            );
          }) : (
            <p className="m-0 text-sm text-[var(--text-secondary)]">{t('groupStatistics.noDataToShow')}</p>
          )}
        </div>
      </div>
    </article>
  );
}

function truncateLabel(label, maxLength = 16) {
  const text = String(label || '').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxLength - 1))}\u2026`;
}

function getRadarPoint(index, total, normalizedRadius, centerX, centerY, radiusX, radiusY) {
  const angle = (-Math.PI / 2) + ((index / Math.max(total, 1)) * Math.PI * 2);
  const safeRadius = Math.max(0, Math.min(1, normalizedRadius));
  return {
    x: centerX + (Math.cos(angle) * (radiusX * safeRadius)),
    y: centerY + (Math.sin(angle) * (radiusY * safeRadius)),
    angle,
  };
}

function toPolygonPoints(points) {
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
}

function getLabelAnchor(angle) {
  const cosine = Math.cos(angle);
  if (cosine > 0.28) return 'start';
  if (cosine < -0.28) return 'end';
  return 'middle';
}

function CategoryRadarChart({ title, entries, theme, hoveredLabel = '', onHoverLabelChange }) {
  const chartWidth = 760;
  const chartHeight = 380;
  const centerX = chartWidth / 2;
  const centerY = chartHeight / 2;
  const radiusX = 280;
  const radiusY = 138;
  const ringLevels = [0.25, 0.5, 0.75, 1];

  const maxAmount = Math.max(1, ...entries.map((entry) => Number(entry.amount) || 0));
  const maxCount = Math.max(1, ...entries.map((entry) => Number(entry.count) || 0));

  const axisPoints = entries.map((entry, index) => ({
    ...getRadarPoint(index, entries.length, 1, centerX, centerY, radiusX, radiusY),
    label: entry.label,
    iconId: entry.iconId,
  }));
  const amountPoints = entries.map((entry, index) => (
    getRadarPoint(index, entries.length, (Number(entry.amount) || 0) / maxAmount, centerX, centerY, radiusX, radiusY)
  ));
  const countPoints = entries.map((entry, index) => (
    getRadarPoint(index, entries.length, (Number(entry.count) || 0) / maxCount, centerX, centerY, radiusX, radiusY)
  ));

  if (!entries.length) {
    return (
      <article className="surface-card p-5">
        <p className="m-0 text-base font-semibold">{title}</p>
        <p className="mt-3 mb-0 text-sm text-[var(--text-secondary)]">{t('groupStatistics.noDataToShow')}</p>
      </article>
    );
  }

  return (
    <article className="surface-card p-5">
      <p className="m-0 text-base font-semibold">{title}</p>
      <div
        className="mt-4 rounded-lg border p-3"
        style={{
          borderColor: theme?.borderSoft || 'var(--border-subtle)',
          background: theme?.bgSoft || 'var(--app-surface-muted)',
        }}
      >
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-[24rem] w-full"
          role="img"
          aria-label={t('groupStatistics.categoryRadarAria')}
          onMouseLeave={() => onHoverLabelChange?.('')}
        >
          {ringLevels.map((level) => {
            const ringPoints = entries.map((_, index) => getRadarPoint(index, entries.length, level, centerX, centerY, radiusX, radiusY));
            return (
              <polygon
                key={level}
                points={toPolygonPoints(ringPoints)}
                fill="none"
                stroke="rgba(17, 24, 39, 0.14)"
                strokeDasharray={level < 1 ? '3 4' : '0'}
              />
            );
          })}

          {axisPoints.map((axisPoint, index) => {
            const isActive = !hoveredLabel || hoveredLabel === axisPoint.label;
            const iconPoint = getRadarPoint(index, entries.length, 1.14, centerX, centerY, radiusX, radiusY);
            const CategoryIcon = getCategoryIcon(axisPoint.iconId);
            const directionX = Math.cos(iconPoint.angle);
            const directionY = Math.sin(iconPoint.angle);
            const labelDistance = 16;
            const labelX = iconPoint.x + (directionX * labelDistance);
            const labelY = iconPoint.y + (directionY * labelDistance);
            const labelAnchor = directionX > 0.28 ? 'start' : directionX < -0.28 ? 'end' : 'middle';
            const labelBaseline = directionY < -0.6 ? 'auto' : directionY > 0.6 ? 'hanging' : 'central';
            return (
              <g
                key={axisPoint.label}
                onMouseEnter={() => onHoverLabelChange?.(axisPoint.label)}
                onFocus={() => onHoverLabelChange?.(axisPoint.label)}
              >
                <line
                  x1={centerX}
                  y1={centerY}
                  x2={axisPoint.x}
                  y2={axisPoint.y}
                  stroke={isActive ? 'rgba(17, 24, 39, 0.28)' : 'rgba(17, 24, 39, 0.10)'}
                />
                <g transform={`translate(${iconPoint.x}, ${iconPoint.y})`}>
                  <circle
                    cx="0"
                    cy="-8"
                    r="10.5"
                    fill={isActive ? 'color-mix(in srgb, var(--app-surface-strong) 88%, white)' : 'color-mix(in srgb, var(--app-surface-muted) 80%, white)'}
                    stroke={isActive ? 'color-mix(in srgb, var(--text-primary) 26%, transparent)' : 'color-mix(in srgb, var(--text-secondary) 18%, transparent)'}
                    strokeWidth="1"
                  />
                  <g transform="translate(-7, -15)">
                    <CategoryIcon
                      size={14}
                      strokeWidth={2.1}
                      color={isActive ? 'var(--text-primary)' : 'color-mix(in srgb, var(--text-secondary) 86%, black)'}
                    />
                  </g>
                </g>
                <text
                  x={labelX}
                  y={labelY - 8}
                  textAnchor={labelAnchor}
                  dominantBaseline={labelBaseline}
                  className={`text-[10px] ${isActive ? 'fill-[var(--text-primary)] font-semibold' : 'fill-[var(--text-secondary)]'}`}
                >
                  {truncateLabel(axisPoint.label)}
                </text>
              </g>
            );
          })}

          <polygon
            points={toPolygonPoints(amountPoints)}
            fill="rgba(178, 93, 61, 0.20)"
            stroke="rgba(178, 93, 61, 0.92)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <polygon
            points={toPolygonPoints(countPoints)}
            fill="rgba(95, 125, 78, 0.18)"
            stroke="rgba(95, 125, 78, 0.95)"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {amountPoints.map((point, index) => {
            const label = entries[index].label;
            const isActive = !hoveredLabel || hoveredLabel === label;
            return (
              <g
                key={`amount-${label}`}
                onMouseEnter={() => onHoverLabelChange?.(label)}
                onFocus={() => onHoverLabelChange?.(label)}
              >
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isActive ? 3.8 : 2.2}
                  fill={isActive ? 'rgba(178, 93, 61, 0.98)' : 'rgba(178, 93, 61, 0.42)'}
                />
              </g>
            );
          })}
          {countPoints.map((point, index) => {
            const label = entries[index].label;
            const isActive = !hoveredLabel || hoveredLabel === label;
            return (
              <g
                key={`count-${label}`}
                onMouseEnter={() => onHoverLabelChange?.(label)}
                onFocus={() => onHoverLabelChange?.(label)}
              >
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isActive ? 3.8 : 2.2}
                  fill={isActive ? 'rgba(95, 125, 78, 1)' : 'rgba(95, 125, 78, 0.42)'}
                />
              </g>
            );
          })}
        </svg>

        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-md border px-2 py-1.5" style={{ borderColor: 'rgba(178, 93, 61, 0.36)' }}>
            <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
              <span className="h-2.5 w-2.5 rounded-full bg-[rgba(178,93,61,0.98)]" />
              {t('groupStatistics.categoryRadarAmountSeries')}
            </span>
            <p className="m-0 text-sm font-semibold amount-neutral">max {formatCurrency(maxAmount, { precise: true })}</p>
          </div>
          <div className="rounded-md border px-2 py-1.5" style={{ borderColor: 'rgba(95, 125, 78, 0.40)' }}>
            <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
              <span className="h-2.5 w-2.5 rounded-full bg-[rgba(95,125,78,1)]" />
              {t('groupStatistics.categoryRadarCountSeries')}
            </span>
            <p className="m-0 text-sm font-semibold amount-neutral">max {t('groupStatistics.countSuffix', { count: maxCount })}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

function MemberRadarChart({ title, entries, theme, hoveredLabel = '', onHoverLabelChange }) {
  const chartWidth = 760;
  const chartHeight = 380;
  const centerX = chartWidth / 2;
  const centerY = chartHeight / 2;
  const radiusX = 280;
  const radiusY = 138;
  const ringLevels = [0.25, 0.5, 0.75, 1];

  const maxAmount = Math.max(1, ...entries.map((entry) => Number(entry.amount) || 0));
  const maxCount = Math.max(1, ...entries.map((entry) => Number(entry.count) || 0));

  const axisPoints = entries.map((entry, index) => ({
    ...getRadarPoint(index, entries.length, 1, centerX, centerY, radiusX, radiusY),
    label: entry.label,
    initials: entry.initials,
    avatarUrl: entry.avatarUrl,
  }));
  const amountPoints = entries.map((entry, index) => (
    getRadarPoint(index, entries.length, (Number(entry.amount) || 0) / maxAmount, centerX, centerY, radiusX, radiusY)
  ));
  const countPoints = entries.map((entry, index) => (
    getRadarPoint(index, entries.length, (Number(entry.count) || 0) / maxCount, centerX, centerY, radiusX, radiusY)
  ));

  if (!entries.length) {
    return (
      <article className="surface-card p-5">
        <p className="m-0 text-base font-semibold">{title}</p>
        <p className="mt-3 mb-0 text-sm text-[var(--text-secondary)]">{t('groupStatistics.noDataToShow')}</p>
      </article>
    );
  }

  return (
    <article className="surface-card p-5">
      <p className="m-0 text-base font-semibold">{title}</p>
      <div
        className="mt-4 rounded-lg border p-3"
        style={{
          borderColor: theme?.borderSoft || 'var(--border-subtle)',
          background: theme?.bgSoft || 'var(--app-surface-muted)',
        }}
      >
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-[24rem] w-full"
          role="img"
          aria-label={t('groupStatistics.memberRadarAria')}
          onMouseLeave={() => onHoverLabelChange?.('')}
        >
          {ringLevels.map((level) => {
            const ringPoints = entries.map((_, index) => getRadarPoint(index, entries.length, level, centerX, centerY, radiusX, radiusY));
            return (
              <polygon
                key={level}
                points={toPolygonPoints(ringPoints)}
                fill="none"
                stroke="rgba(17, 24, 39, 0.14)"
                strokeDasharray={level < 1 ? '3 4' : '0'}
              />
            );
          })}

          {axisPoints.map((axisPoint, index) => {
            const isActive = !hoveredLabel || hoveredLabel === axisPoint.label;
            const iconPoint = getRadarPoint(index, entries.length, 1.14, centerX, centerY, radiusX, radiusY);
            const directionX = Math.cos(iconPoint.angle);
            const directionY = Math.sin(iconPoint.angle);
            const labelDistance = 16;
            const labelX = iconPoint.x + (directionX * labelDistance);
            const labelY = iconPoint.y + (directionY * labelDistance);
            const labelAnchor = directionX > 0.28 ? 'start' : directionX < -0.28 ? 'end' : 'middle';
            const labelBaseline = directionY < -0.6 ? 'auto' : directionY > 0.6 ? 'hanging' : 'central';
            return (
              <g
                key={axisPoint.label}
                onMouseEnter={() => onHoverLabelChange?.(axisPoint.label)}
                onFocus={() => onHoverLabelChange?.(axisPoint.label)}
              >
                <line
                  x1={centerX}
                  y1={centerY}
                  x2={axisPoint.x}
                  y2={axisPoint.y}
                  stroke={isActive ? 'rgba(17, 24, 39, 0.28)' : 'rgba(17, 24, 39, 0.10)'}
                />
                <g transform={`translate(${iconPoint.x}, ${iconPoint.y})`}>
                  <circle
                    cx="0"
                    cy="-8"
                    r="10.5"
                    fill={isActive ? 'color-mix(in srgb, var(--app-surface-strong) 88%, white)' : 'color-mix(in srgb, var(--app-surface-muted) 80%, white)'}
                    stroke={isActive ? 'color-mix(in srgb, var(--text-primary) 26%, transparent)' : 'color-mix(in srgb, var(--text-secondary) 18%, transparent)'}
                    strokeWidth="1"
                  />
                  {axisPoint.avatarUrl ? (
                    <>
                      <defs>
                        <clipPath id={`member-radar-avatar-clip-${index}`}>
                          <circle cx="0" cy="-8" r="8.2" />
                        </clipPath>
                      </defs>
                      <image
                        href={axisPoint.avatarUrl}
                        x="-8.2"
                        y="-16.2"
                        width="16.4"
                        height="16.4"
                        preserveAspectRatio="xMidYMid slice"
                        clipPath={`url(#member-radar-avatar-clip-${index})`}
                      />
                    </>
                  ) : (
                    <text
                      x="0"
                      y="-8"
                      textAnchor="middle"
                      dominantBaseline="central"
                      className={`text-[8px] ${isActive ? 'fill-[var(--text-primary)] font-semibold' : 'fill-[var(--text-secondary)] font-medium'}`}
                    >
                      {String(axisPoint.initials || '').slice(0, 2).toUpperCase()}
                    </text>
                  )}
                </g>
                <text
                  x={labelX}
                  y={labelY - 8}
                  textAnchor={labelAnchor}
                  dominantBaseline={labelBaseline}
                  className={`text-[10px] ${isActive ? 'fill-[var(--text-primary)] font-semibold' : 'fill-[var(--text-secondary)]'}`}
                >
                  {truncateLabel(axisPoint.label)}
                </text>
              </g>
            );
          })}

          <polygon
            points={toPolygonPoints(amountPoints)}
            fill="rgba(178, 93, 61, 0.20)"
            stroke="rgba(178, 93, 61, 0.92)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <polygon
            points={toPolygonPoints(countPoints)}
            fill="rgba(95, 125, 78, 0.18)"
            stroke="rgba(95, 125, 78, 0.95)"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {amountPoints.map((point, index) => {
            const label = entries[index].label;
            const isActive = !hoveredLabel || hoveredLabel === label;
            return (
              <g
                key={`member-amount-${label}`}
                onMouseEnter={() => onHoverLabelChange?.(label)}
                onFocus={() => onHoverLabelChange?.(label)}
              >
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isActive ? 3.8 : 2.2}
                  fill={isActive ? 'rgba(178, 93, 61, 0.98)' : 'rgba(178, 93, 61, 0.42)'}
                />
              </g>
            );
          })}
          {countPoints.map((point, index) => {
            const label = entries[index].label;
            const isActive = !hoveredLabel || hoveredLabel === label;
            return (
              <g
                key={`member-count-${label}`}
                onMouseEnter={() => onHoverLabelChange?.(label)}
                onFocus={() => onHoverLabelChange?.(label)}
              >
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isActive ? 3.8 : 2.2}
                  fill={isActive ? 'rgba(95, 125, 78, 1)' : 'rgba(95, 125, 78, 0.42)'}
                />
              </g>
            );
          })}
        </svg>

        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-md border px-2 py-1.5" style={{ borderColor: 'rgba(178, 93, 61, 0.36)' }}>
            <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
              <span className="h-2.5 w-2.5 rounded-full bg-[rgba(178,93,61,0.98)]" />
              {t('groupStatistics.memberRadarAmountSeries')}
            </span>
            <p className="m-0 text-sm font-semibold amount-neutral">max {formatCurrency(maxAmount, { precise: true })}</p>
          </div>
          <div className="rounded-md border px-2 py-1.5" style={{ borderColor: 'rgba(95, 125, 78, 0.40)' }}>
            <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
              <span className="h-2.5 w-2.5 rounded-full bg-[rgba(95,125,78,1)]" />
              {t('groupStatistics.memberRadarCountSeries')}
            </span>
            <p className="m-0 text-sm font-semibold amount-neutral">max {t('groupStatistics.countSuffix', { count: maxCount })}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

function createEmptyTimelineTotals() {
  return {
    amount: 0,
    count: 0,
    expenseAmount: 0,
    transferAmount: 0,
    expenseCount: 0,
    transferCount: 0,
  };
}

function getTimelineModeFlags(timelineDataMode) {
  return {
    includeExpenses: timelineDataMode === 'both' || timelineDataMode === 'expenses',
    includeTransfers: timelineDataMode === 'both' || timelineDataMode === 'transfers',
  };
}

function getTimelineDates(expenses, settlements, includeExpenses, includeTransfers) {
  return [
    ...(includeExpenses ? expenses.map((expense) => new Date(expense.occurred_at || expense.created_at)) : []),
    ...(includeTransfers ? settlements.map((settlement) => new Date(settlement.settled_at)) : []),
  ].filter((date) => !Number.isNaN(date.getTime()));
}

function mergeTimelineTotals(timelineTotals, key, updates) {
  const current = timelineTotals.get(key) || createEmptyTimelineTotals();
  timelineTotals.set(key, {
    ...current,
    ...updates,
    amount: current.amount + (updates.amount || 0),
    count: current.count + (updates.count || 0),
    expenseAmount: current.expenseAmount + (updates.expenseAmount || 0),
    transferAmount: current.transferAmount + (updates.transferAmount || 0),
    expenseCount: current.expenseCount + (updates.expenseCount || 0),
    transferCount: current.transferCount + (updates.transferCount || 0),
  });
}

function buildTimelineTotals(expenses, settlements, timelineGranularity, includeExpenses, includeTransfers) {
  const timelineTotals = new Map();

  if (includeExpenses) {
    for (const expense of expenses) {
      const expenseDate = new Date(expense.occurred_at || expense.created_at);
      if (Number.isNaN(expenseDate.getTime())) {
        continue;
      }
      const key = periodKey(startOfPeriod(expenseDate, timelineGranularity));
      const amount = Number(expense.amount || 0);
      mergeTimelineTotals(timelineTotals, key, {
        amount,
        count: 1,
        expenseAmount: amount,
        expenseCount: 1,
      });
    }
  }

  if (includeTransfers) {
    for (const settlement of settlements) {
      const transferDate = new Date(settlement.settled_at);
      if (Number.isNaN(transferDate.getTime())) {
        continue;
      }
      const key = periodKey(startOfPeriod(transferDate, timelineGranularity));
      const amount = Number(settlement.amount || 0);
      mergeTimelineTotals(timelineTotals, key, {
        amount,
        count: 1,
        transferAmount: amount,
        transferCount: 1,
      });
    }
  }

  return timelineTotals;
}

function buildTimelinePeriods(timelineTotals, timelineDates, timelineGranularity) {
  if (!timelineDates.length) {
    const now = startOfPeriod(new Date(), timelineGranularity);
    return [{
      key: periodKey(now),
      label: formatPeriodLabel(now, timelineGranularity),
      ...createEmptyTimelineTotals(),
    }];
  }

  const minDate = startOfPeriod(new Date(Math.min(...timelineDates.map((date) => date.getTime()))), timelineGranularity);
  const maxDate = startOfPeriod(new Date(Math.max(...timelineDates.map((date) => date.getTime()))), timelineGranularity);
  const periods = [];

  for (let cursor = new Date(minDate); cursor <= maxDate; cursor = addPeriod(cursor, timelineGranularity)) {
    const key = periodKey(cursor);
    periods.push({
      key,
      label: formatPeriodLabel(cursor, timelineGranularity),
      ...(timelineTotals.get(key) || createEmptyTimelineTotals()),
    });
  }

  return periods;
}

function getCategorySortOrderMap(expenseCategories) {
  return new Map(
    expenseCategories.map((category) => [String(category.name || '').trim().toLowerCase(), Number(category.sort_order)]),
  );
}

function buildCategoryEntries(expenses, categorySortOrderByName) {
  const categoryMap = new Map();
  for (const expense of expenses) {
    const label = expense.category_name || 'Ingen kategori';
    const current = categoryMap.get(label) || { amount: 0, count: 0, iconId: '' };
    current.amount += Number(expense.amount || 0);
    current.count += 1;
    if (!current.iconId) {
      current.iconId = String(expense.category_icon || 'shapes');
    }
    categoryMap.set(label, current);
  }

  return Array.from(categoryMap.entries())
    .map(([label, data]) => ({ label, amount: data.amount, count: data.count, iconId: data.iconId || 'shapes' }))
    .sort((a, b) => {
      const orderA = categorySortOrderByName.get(String(a.label || '').trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      const orderB = categorySortOrderByName.get(String(b.label || '').trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return b.amount - a.amount;
    });
}

function getPeriodDates(expenses, settlements) {
  return [
    ...expenses.map((expense) => expense.occurred_at || expense.created_at),
    ...settlements.map((settlement) => settlement.settled_at),
  ]
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
}

function buildMemberRows(members, expenses, settlements) {
  const balanceMap = new Map(members.map((member) => [member.id, 0]));
  const memberStatsMap = new Map(members.map((member) => [member.id, {
    expenseCount: 0,
    paid: 0,
    transferCount: 0,
    transfers: 0,
    totalOwed: 0,
  }]));

  for (const expense of expenses) {
    const payerId = Number(expense.paid_by_user_id);
    const amount = Number(expense.amount || 0);
    const payerStats = memberStatsMap.get(payerId);
    if (payerStats) {
      payerStats.expenseCount += 1;
      payerStats.paid += amount;
    }

    balanceMap.set(payerId, (balanceMap.get(payerId) || 0) + amount);

    for (const split of expense.splits || []) {
      const splitUserId = Number(split.user_id);
      const owed = Number(split.amount_owed || 0);
      const splitStats = memberStatsMap.get(splitUserId);
      if (splitStats) {
        splitStats.totalOwed += owed;
      }
      balanceMap.set(splitUserId, (balanceMap.get(splitUserId) || 0) - owed);
    }
  }

  for (const settlement of settlements) {
    const payerId = Number(settlement.payer_id);
    const receiverId = Number(settlement.receiver_id);
    const amount = Number(settlement.amount || 0);
    const payerStats = memberStatsMap.get(payerId);
    if (payerStats) {
      payerStats.transferCount += 1;
      payerStats.transfers += amount;
    }

    balanceMap.set(payerId, (balanceMap.get(payerId) || 0) + amount);
    balanceMap.set(receiverId, (balanceMap.get(receiverId) || 0) - amount);
  }

  return members.map((member) => {
    const stats = memberStatsMap.get(member.id) || {
      expenseCount: 0,
      paid: 0,
      transferCount: 0,
      transfers: 0,
      totalOwed: 0,
    };

    return {
      ...member,
      ...stats,
      balance: Math.round(balanceMap.get(member.id) || 0),
    };
  });
}

function buildStatistics({ expenses, expenseCategories, members, settlements, timelineDataMode, timelineGranularity }) {
  const { includeExpenses, includeTransfers } = getTimelineModeFlags(timelineDataMode);
  const timelineDates = getTimelineDates(expenses, settlements, includeExpenses, includeTransfers);
  const timelineTotals = buildTimelineTotals(expenses, settlements, timelineGranularity, includeExpenses, includeTransfers);
  const timelinePeriods = buildTimelinePeriods(timelineTotals, timelineDates, timelineGranularity);

  const categorySortOrderByName = getCategorySortOrderMap(expenseCategories);
  const categoryEntries = buildCategoryEntries(expenses, categorySortOrderByName);

  const paidByMap = buildTotals(
    expenses,
    (expense) => getUserDisplayName({ id: expense.paid_by_user_id, full_name: expense.paid_by_full_name }),
    (expense) => Number(expense.amount || 0),
  );

  const periodDates = getPeriodDates(expenses, settlements);
  const memberRows = buildMemberRows(members, expenses, settlements);

  return {
    totalSpent: expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    totalTransfers: settlements.reduce((sum, settlement) => sum + Number(settlement.amount || 0), 0),
    membersCount: members.length,
    expensesCount: expenses.length,
    transfersCount: settlements.length,
    periodRange: formatRangeLabel(periodDates[0], periodDates.at(-1)),
    timelinePeriods,
    categoryData: toPieData(categoryEntries.map((entry) => ({ label: entry.label, value: entry.amount })), { sortByValue: false }),
    categoryTransactionData: toPieData(categoryEntries.map((entry) => ({ label: entry.label, value: entry.count })), { sortByValue: false }),
    categoryRadarData: categoryEntries,
    memberRadarData: memberRows.map((member) => ({
      label: getUserDisplayName(member),
      initials: getUserInitials(member),
      avatarUrl: getUserAvatarUrl(member),
      amount: Number(member.paid || 0) + Number(member.transfers || 0),
      count: Number(member.expenseCount || 0) + Number(member.transferCount || 0),
    })),
    paidByData: toPieData(Array.from(paidByMap.entries()).map(([label, value]) => ({ label, value }))),
    transfersByMemberData: toPieData(
      memberRows.map((member) => ({
        label: getUserDisplayName(member),
        value: Number(member.transfers || 0),
      })),
    ),
    memberRows,
  };
}

export default function GroupStatistics() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [timelineGranularity, setTimelineGranularity] = useState('month');
  const [timelineDataMode, setTimelineDataMode] = useState('both');
  const [hoveredCategoryLabel, setHoveredCategoryLabel] = useState('');
  const [hoveredMemberLabel, setHoveredMemberLabel] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const groupData = await get(`/api/groups/${slug}`);
      const [expensesData, categoriesData, settlementsData] = await Promise.all([
        get(`/api/expenses/${groupData.id}`),
        get('/api/expenses/categories'),
        get(`/api/settlements/${groupData.id}`),
      ]);
      setGroup(groupData);
      setExpenses(expensesData);
      setExpenseCategories(categoriesData);
      setSettlements(settlementsData);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const groupSlug = group?.slug || slug;

  useEffect(() => {
    if (!group?.name) return undefined;
    document.title = `Kvitt | ${group.name}`;
    return () => {
      document.title = 'Kvitt';
    };
  }, [group?.name]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setTimelineGranularity(getAutomaticTimelineGranularity(expenses, settlements, timelineDataMode));
  }, [slug, expenses, settlements, timelineDataMode]);

  const members = group?.members ?? [];
  const theme = getThemeForGroup(group);

  const statistics = useMemo(() => buildStatistics({
    expenses,
    expenseCategories,
    members,
    settlements,
    timelineDataMode,
    timelineGranularity,
  }), [expenses, expenseCategories, members, settlements, timelineDataMode, timelineGranularity]);
  const showCategoryRadarChart = statistics.categoryRadarData.length > 2;
  const showMemberRadarChart = statistics.membersCount > 2;

  if (loading) {
    return <StatisticsSkeleton />;
  }

  return (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden p-0">
        <div className="h-1.5 w-full" style={{ background: theme.base }} />
        <div className="space-y-5 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="section-eyebrow">Gruppstatistik</p>
              <h1 className="page-title">{group?.name}</h1>
            </div>
            <button type="button" className="btn-secondary" onClick={() => navigate(`/groups/${groupSlug}`)}>
              <ArrowLeft className="h-4 w-4" />
              {t('groupStatistics.backToGroup')}
            </button>
          </div>

          {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

          <aside className="rounded-lg border p-4" style={{ background: theme.bgSoft, borderColor: theme.borderSoft }}>
              <p className="m-0 text-sm font-semibold">{t('groupStatistics.overview')}</p>
              <div className="mt-3 space-y-1.5 text-sm">
                {[
                  { label: t('groupStatistics.totalSpent'), value: formatCurrency(statistics.totalSpent, { precise: true }) },
                  { label: t('groupStatistics.memberCount'), value: t('groupStatistics.countSuffix', { count: statistics.membersCount }) },
                  { label: t('groupStatistics.expenseCount'), value: t('groupStatistics.countSuffix', { count: statistics.expensesCount }) },
                  { label: t('groupStatistics.totalExpenses'), value: formatCurrency(statistics.totalSpent, { precise: true }) },
                  { label: t('groupStatistics.settlementCount'), value: t('groupStatistics.countSuffix', { count: statistics.transfersCount }) },
                  { label: t('groupStatistics.totalSettlements'), value: formatCurrency(statistics.totalTransfers, { precise: true }) },
                ].map((row, index) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5"
                    style={{
                      background: getOverviewRowBackground(index),
                    }}
                  >
                    <span className="text-[var(--text-secondary)]">{row.label}</span>
                    <span className="font-semibold">{row.value}</span>
                  </div>
                ))}
              </div>
            </aside>

          <article className="min-w-0 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] p-4">
              <div className="mt-2">
                <TimelineChart
                  periods={statistics.timelinePeriods}
                  granularity={timelineGranularity}
                  onGranularityChange={setTimelineGranularity}
                  dataMode={timelineDataMode}
                  onDataModeChange={setTimelineDataMode}
                  theme={theme}
                />
              </div>
            </article>
        </div>
      </section>

      <section className="surface-card p-5">
        <p className="m-0 text-base font-semibold">{t('groupStatistics.members')}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {statistics.memberRows.map((member) => (
            <article key={member.id} className="relative rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] p-4">
              {Number(member.id) === Number(group?.created_by) ? (
                <span className="absolute right-4 top-4 inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                  {t('groupView.owner')}
                </span>
              ) : null}
              <div className="flex items-center gap-3">
                <UserAvatar
                  user={member}
                  className="grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-[var(--app-surface-muted)]"
                  imageClassName="h-full w-full object-cover"
                  initialsClassName="text-sm font-semibold text-[var(--text-secondary)]"
                />
                <h2 className="m-0 text-lg font-semibold">{getUserDisplayName(member)}</h2>
              </div>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">{t('groupStatistics.expenseCount')}</span>
                  <span className="font-semibold">{t('groupStatistics.countSuffix', { count: member.expenseCount })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">{t('groupStatistics.totalExpenses')}</span>
                  <span className="font-semibold">{formatCurrency(member.paid, { precise: true })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">{t('groupStatistics.totalCost')}</span>
                  <span className="font-semibold">{formatCurrency(member.totalOwed, { precise: true })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">{t('groupStatistics.settlementCount')}</span>
                  <span className="font-semibold">{t('groupStatistics.countSuffix', { count: member.transferCount })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">{t('groupStatistics.totalSettlements')}</span>
                  <span className="font-semibold">{formatCurrency(member.transfers, { precise: true })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">{t('groupStatistics.currentBalance')}</span>
                  <span className={`font-semibold ${getBalanceClass(member.balance)}`}>
                    {member.balance < 0 ? '-' : ''}
                    {formatCurrency(Math.abs(member.balance), { precise: true })}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <PieCard
          title={t('groupStatistics.expensesPerMember')}
          entries={statistics.paidByData}
          highlightedLabel={hoveredMemberLabel}
          onHighlightChange={setHoveredMemberLabel}
        />
        <PieCard
          title={t('groupStatistics.settlementsPerMember')}
          entries={statistics.transfersByMemberData}
          highlightedLabel={hoveredMemberLabel}
          onHighlightChange={setHoveredMemberLabel}
        />
        <PieCard
          title={t('groupStatistics.expensesPerCategory')}
          entries={statistics.categoryData}
          highlightedLabel={hoveredCategoryLabel}
          onHighlightChange={setHoveredCategoryLabel}
        />
        <PieCard
          title={t('groupStatistics.transactionsPerCategory')}
          entries={statistics.categoryTransactionData}
          formatValue={(value) => t('groupStatistics.countSuffix', { count: Number(value) || 0 })}
          highlightedLabel={hoveredCategoryLabel}
          onHighlightChange={setHoveredCategoryLabel}
        />
        {showCategoryRadarChart ? (
          <div className="lg:col-span-2">
            <CategoryRadarChart
              title={t('groupStatistics.categoryRadarTitle')}
              entries={statistics.categoryRadarData}
              theme={theme}
              hoveredLabel={hoveredCategoryLabel}
              onHoverLabelChange={setHoveredCategoryLabel}
            />
          </div>
        ) : null}
        {showMemberRadarChart ? (
          <div className="lg:col-span-2">
            <MemberRadarChart
              title={t('groupStatistics.memberRadarTitle')}
              entries={statistics.memberRadarData}
              theme={theme}
              hoveredLabel={hoveredMemberLabel}
              onHoverLabelChange={setHoveredMemberLabel}
            />
          </div>
        ) : null}
      </section>

      {!statistics.expensesCount ? (
        <section className="surface-card p-6 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
          <p className="mt-3 mb-0 text-sm text-[var(--text-secondary)]">{t('groupStatistics.emptyStatistics')}</p>
        </section>
      ) : null}
    </div>
  );
}
