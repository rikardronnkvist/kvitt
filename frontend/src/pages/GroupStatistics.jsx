import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { get } from '../api/client.js';
import { formatCurrency } from '../lib/format.js';
import { getThemeForGroup } from '../lib/groupTheme.js';
import { getUserDisplayName, getUserInitials } from '../lib/users.js';

const PIE_COLORS = ['#0F766E', '#4F6D8A', '#B25D3D', '#5F7D4E', '#6E4E73', '#B38A2E', '#5C6B73'];
const TIMELINE_GRANULARITY_OPTIONS = [
  { value: 'day', label: 'Dag' },
  { value: 'week', label: 'Vecka' },
  { value: 'month', label: 'Månad' },
  { value: 'year', label: 'År' },
];
const TIMELINE_DATA_OPTIONS = [
  { value: 'both', label: 'Båda' },
  { value: 'expenses', label: 'Utgifter' },
  { value: 'transfers', label: 'Överföringar' },
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

function toTimestamp(value) {
  if (!value) return Number.NaN;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? Number.NaN : parsed.getTime();
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
  let niceNormalized = 1;

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
  if (!minDate || !maxDate) return 'Ingen period';
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

function toPieData(entries) {
  return entries
    .filter((entry) => Number(entry.value) > 0)
    .sort((a, b) => b.value - a.value)
    .map((entry, index) => ({
      ...entry,
      color: PIE_COLORS[index % PIE_COLORS.length],
    }));
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
  const minLabelSpacing = granularity === 'day' ? 66 : granularity === 'week' ? 90 : granularity === 'month' ? 70 : 48;
  const maxVisibleLabels = Math.max(2, Math.floor(chartWidth / minLabelSpacing));
  const labelInterval = Math.max(1, Math.ceil(periods.length / maxVisibleLabels));
  const shownLabelIndexes = new Set();
  for (let i = 0; i < periods.length; i += labelInterval) {
    shownLabelIndexes.add(i);
  }
  const lastIndex = periods.length - 1;
  const previousShownIndex = Array.from(shownLabelIndexes).sort((a, b) => a - b).at(-1);
  if (lastIndex >= 0 && (previousShownIndex == null || (lastIndex - previousShownIndex) * stepX >= (minLabelSpacing * 0.8))) {
    shownLabelIndexes.add(lastIndex);
  }

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const countPoints = periods.map((item, index) => {
    const x = margin.left + stepX * index + (stepX / 2);
    const y = margin.top + chartHeight - ((Number(item.count || 0) / maxCount) * chartHeight);
    return { x, y, value: Number(item.count || 0), key: item.key };
  });
  const countPath = countPoints.map((point) => `${point.x},${point.y}`).join(' ');
  const isCombinedMode = dataMode === 'both';
  const amountAxisLabel = dataMode === 'expenses'
    ? 'Totala utgifter'
    : dataMode === 'transfers'
      ? 'Totala överföringar'
      : 'Utgifter + överföringar';
  const countAxisLabel = dataMode === 'expenses'
    ? 'Antal utgifter'
    : dataMode === 'transfers'
      ? 'Antal överföringar'
      : 'Antal händelser';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 hidden text-sm font-semibold sm:block">Tidslinje</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
            Data:
            <select
              className="w-auto min-w-[7rem] rounded-md border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-2 py-1 text-xs text-[var(--text-primary)]"
              value={dataMode}
              onChange={(event) => onDataModeChange(event.target.value)}
              aria-label="Välj typ av data för tidslinjen"
            >
              {TIMELINE_DATA_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
            Visa:
            <select
              className="w-auto min-w-[6rem] rounded-md border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-2 py-1 text-xs text-[var(--text-primary)]"
              value={granularity}
              onChange={(event) => onGranularityChange(event.target.value)}
              aria-label="Välj upplösning för tidslinjen"
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
                  Utgifter
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[rgba(15,118,110,0.72)]" aria-hidden="true" />
                  Överföringar
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
          <svg viewBox={`0 0 ${width} ${height}`} className="h-[250px] w-full" role="img" aria-label="Utgiftstidslinje med antal utgifter">
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
              const safeTotal = item.amount > 0 ? item.amount : 0;
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
                      fill={dataMode === 'expenses' ? 'rgba(17, 24, 39, 0.68)' : 'rgba(15, 118, 110, 0.72)'}
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

function PieCard({ title, entries }) {
  const [hoveredLabel, setHoveredLabel] = useState('');
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
    const distance = Math.sqrt((dx * dx) + (dy * dy));

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
            <div
              key={entry.label}
              className={`flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition ${isActive ? 'bg-[var(--app-surface-muted)]' : ''}`}
              onMouseEnter={() => setHoveredLabel(entry.label)}
              onMouseLeave={() => setHoveredLabel('')}
              onFocus={() => setHoveredLabel(entry.label)}
              onBlur={() => setHoveredLabel('')}
              tabIndex={0}
            >
              <span className="inline-flex items-center gap-2 text-[var(--text-secondary)]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} />
                {entry.label}
              </span>
              <span className="font-semibold amount-neutral">{formatCurrency(entry.value, { precise: true })}</span>
            </div>
            );
          }) : (
            <p className="m-0 text-sm text-[var(--text-secondary)]">Ingen data att visa.</p>
          )}
        </div>
      </div>
    </article>
  );
}

export default function GroupStatistics() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [timelineGranularity, setTimelineGranularity] = useState('month');
  const [timelineDataMode, setTimelineDataMode] = useState('both');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const groupData = await get(`/api/groups/${slug}`);
      const [expensesData, settlementsData] = await Promise.all([
        get(`/api/expenses/${groupData.id}`),
        get(`/api/settlements/${groupData.id}`),
      ]);
      setGroup(groupData);
      setExpenses(expensesData);
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

  const statistics = useMemo(() => {
    const includeExpenses = timelineDataMode === 'both' || timelineDataMode === 'expenses';
    const includeTransfers = timelineDataMode === 'both' || timelineDataMode === 'transfers';

    const timelineDates = [
      ...(includeExpenses ? expenses.map((expense) => new Date(expense.occurred_at || expense.created_at)) : []),
      ...(includeTransfers ? settlements.map((settlement) => new Date(settlement.settled_at)) : []),
    ]
      .filter((date) => !Number.isNaN(date.getTime()));

    const timelineTotals = new Map();
    if (includeExpenses) {
      for (const expense of expenses) {
        const expenseDate = new Date(expense.occurred_at || expense.created_at);
        if (Number.isNaN(expenseDate.getTime())) {
          continue;
        }
        const periodStart = startOfPeriod(expenseDate, timelineGranularity);
        const key = periodKey(periodStart);
        const current = timelineTotals.get(key) || {
          amount: 0,
          count: 0,
          expenseAmount: 0,
          transferAmount: 0,
          expenseCount: 0,
          transferCount: 0,
        };
        const amount = Number(expense.amount || 0);
        timelineTotals.set(key, {
          ...current,
          amount: current.amount + amount,
          count: current.count + 1,
          expenseAmount: current.expenseAmount + amount,
          expenseCount: current.expenseCount + 1,
        });
      }
    }

    if (includeTransfers) {
      for (const settlement of settlements) {
        const transferDate = new Date(settlement.settled_at);
        if (Number.isNaN(transferDate.getTime())) {
          continue;
        }
        const periodStart = startOfPeriod(transferDate, timelineGranularity);
        const key = periodKey(periodStart);
        const current = timelineTotals.get(key) || {
          amount: 0,
          count: 0,
          expenseAmount: 0,
          transferAmount: 0,
          expenseCount: 0,
          transferCount: 0,
        };
        const amount = Number(settlement.amount || 0);
        timelineTotals.set(key, {
          ...current,
          amount: current.amount + amount,
          count: current.count + 1,
          transferAmount: current.transferAmount + amount,
          transferCount: current.transferCount + 1,
        });
      }
    }

    let timelinePeriods = [];
    if (timelineDates.length) {
      const minDate = startOfPeriod(new Date(Math.min(...timelineDates.map((date) => date.getTime()))), timelineGranularity);
      const maxDate = startOfPeriod(new Date(Math.max(...timelineDates.map((date) => date.getTime()))), timelineGranularity);
      for (let cursor = new Date(minDate); cursor <= maxDate; cursor = addPeriod(cursor, timelineGranularity)) {
        const key = periodKey(cursor);
        const totals = timelineTotals.get(key);
        timelinePeriods.push({
          key,
          label: formatPeriodLabel(cursor, timelineGranularity),
          amount: totals?.amount || 0,
          count: totals?.count || 0,
          expenseAmount: totals?.expenseAmount || 0,
          transferAmount: totals?.transferAmount || 0,
          expenseCount: totals?.expenseCount || 0,
          transferCount: totals?.transferCount || 0,
        });
      }
    }

    if (!timelinePeriods.length) {
      const now = startOfPeriod(new Date(), timelineGranularity);
      timelinePeriods = [{
        key: periodKey(now),
        label: formatPeriodLabel(now, timelineGranularity),
        amount: 0,
        count: 0,
        expenseAmount: 0,
        transferAmount: 0,
        expenseCount: 0,
        transferCount: 0,
      }];
    }

    const categoryMap = buildTotals(
      expenses,
      (expense) => expense.category_name || 'Ingen kategori',
      (expense) => Number(expense.amount || 0),
    );

    const paidByMap = buildTotals(
      expenses,
      (expense) => getUserDisplayName({ id: expense.paid_by_user_id, full_name: expense.paid_by_full_name }),
      (expense) => Number(expense.amount || 0),
    );

    const periodDates = [
      ...expenses.map((expense) => expense.occurred_at || expense.created_at),
      ...settlements.map((settlement) => settlement.settled_at),
    ]
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    const balanceMap = new Map(members.map((member) => [member.id, 0]));
    expenses.forEach((expense) => {
      balanceMap.set(
        expense.paid_by_user_id,
        (balanceMap.get(expense.paid_by_user_id) || 0) + Number(expense.amount || 0),
      );

      (expense.splits || []).forEach((split) => {
        balanceMap.set(
          split.user_id,
          (balanceMap.get(split.user_id) || 0) - Number(split.amount_owed || 0),
        );
      });
    });

    settlements.forEach((settlement) => {
      balanceMap.set(
        settlement.payer_id,
        (balanceMap.get(settlement.payer_id) || 0) + Number(settlement.amount || 0),
      );
      balanceMap.set(
        settlement.receiver_id,
        (balanceMap.get(settlement.receiver_id) || 0) - Number(settlement.amount || 0),
      );
    });

    const memberRows = members.map((member) => {
      const expenseCount = expenses
        .filter((expense) => Number(expense.paid_by_user_id) === Number(member.id))
        .length;

      const paid = expenses
        .filter((expense) => Number(expense.paid_by_user_id) === Number(member.id))
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

      const transferCount = settlements
        .filter((settlement) => Number(settlement.payer_id) === Number(member.id))
        .length;

      const transfers = settlements
        .filter((settlement) => Number(settlement.payer_id) === Number(member.id))
        .reduce((sum, settlement) => sum + Number(settlement.amount || 0), 0);

      const totalOwed = expenses
        .flatMap((expense) => expense.splits || [])
        .filter((split) => Number(split.user_id) === Number(member.id))
        .reduce((sum, split) => sum + Number(split.amount_owed || 0), 0);

      return {
        ...member,
        expenseCount,
        paid,
        transferCount,
        transfers,
        totalOwed,
        balance: Math.round(balanceMap.get(member.id) || 0),
      };
    });

    const transfersByMemberData = toPieData(
      memberRows.map((member) => ({
        label: getUserDisplayName(member),
        value: Number(member.transfers || 0),
      })),
    );

    return {
      totalSpent: expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
      totalTransfers: settlements.reduce((sum, settlement) => sum + Number(settlement.amount || 0), 0),
      membersCount: members.length,
      expensesCount: expenses.length,
      transfersCount: settlements.length,
      periodRange: formatRangeLabel(periodDates[0], periodDates[periodDates.length - 1]),
      timelinePeriods,
      categoryData: toPieData(Array.from(categoryMap.entries()).map(([label, value]) => ({ label, value }))),
      paidByData: toPieData(Array.from(paidByMap.entries()).map(([label, value]) => ({ label, value }))),
      transfersByMemberData,
      memberRows,
    };
  }, [expenses, members, settlements, timelineDataMode, timelineGranularity]);

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
              Tillbaka till gruppen
            </button>
          </div>

          {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_250px]">
            <article className="min-w-0 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] p-4 xl:order-first">
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

            <aside className="order-first rounded-lg border p-4 xl:order-last" style={{ background: theme.bgSoft, borderColor: theme.borderSoft }}>
              <p className="m-0 text-sm font-semibold">Översikt</p>
              <div className="mt-3 space-y-1.5 text-sm">
                {[
                  { label: 'Totalt spenderat', value: formatCurrency(statistics.totalSpent, { precise: true }) },
                  { label: 'Antal medlemmar', value: `${statistics.membersCount} st` },
                  { label: 'Antal utgifter', value: `${statistics.expensesCount} st` },
                  { label: 'Totala utgifter', value: formatCurrency(statistics.totalSpent, { precise: true }) },
                  { label: 'Antal överföringar', value: `${statistics.transfersCount} st` },
                  { label: 'Totala överföringar', value: formatCurrency(statistics.totalTransfers, { precise: true }) },
                ].map((row, index) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5"
                    style={{
                      background: index % 2 === 0
                        ? 'color-mix(in srgb, var(--app-surface-strong) 80%, transparent)'
                        : 'color-mix(in srgb, var(--app-surface-muted) 70%, transparent)',
                    }}
                  >
                    <span className="text-[var(--text-secondary)]">{row.label}</span>
                    <span className="font-semibold">{row.value}</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="surface-card p-5">
        <p className="m-0 text-base font-semibold">Medlemmar</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {statistics.memberRows.map((member) => (
            <article key={member.id} className="relative rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] p-4">
              {Number(member.id) === Number(group?.created_by) ? (
                <span className="absolute right-4 top-4 inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                  Ägare
                </span>
              ) : null}
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-[var(--app-surface-muted)] text-sm font-semibold text-[var(--text-secondary)]">
                  {getUserInitials(member)}
                </div>
                <h2 className="m-0 text-lg font-semibold">{getUserDisplayName(member)}</h2>
              </div>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Antal utgifter</span>
                  <span className="font-semibold">{member.expenseCount} st</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Totala utgifter</span>
                  <span className="font-semibold">{formatCurrency(member.paid, { precise: true })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Total kostnad</span>
                  <span className="font-semibold">{formatCurrency(member.totalOwed, { precise: true })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Antal överföringar</span>
                  <span className="font-semibold">{member.transferCount} st</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Totala överföringar</span>
                  <span className="font-semibold">{formatCurrency(member.transfers, { precise: true })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Nuvarande balans</span>
                  <span className={`font-semibold ${member.balance > 0 ? 'amount-positive' : member.balance < 0 ? 'amount-negative' : 'amount-neutral'}`}>
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
        <PieCard title="Utgifter per medlem" entries={statistics.paidByData} />
        <PieCard title="Överföringar per medlem" entries={statistics.transfersByMemberData} />
        <PieCard title="Utgifter per kategori" entries={statistics.categoryData} />
      </section>

      {!statistics.expensesCount ? (
        <section className="surface-card p-6 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
          <p className="mt-3 mb-0 text-sm text-[var(--text-secondary)]">Ingen statistik än nu. Lägg till utgifter i gruppen för att se grafer.</p>
        </section>
      ) : null}
    </div>
  );
}
