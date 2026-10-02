import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { formatCurrency } from '../lib/format.js';
import { getUserAvatarUrl, getUserDisplayName, getUserInitials } from '../lib/users.js';
import { t } from '../lib/i18n.js';

const NODE_GAP = 20;
const CHART_MARGIN = 16;

function getFlowWidthScale(payments, targetHeight) {
  let minimum = 0;
  let maximum = targetHeight / Math.min(...payments.map((payment) => payment.amount));

  for (let iteration = 0; iteration < 40; iteration += 1) {
    const scale = (minimum + maximum) / 2;
    const totalHeight = payments.reduce((sum, payment) => sum + Math.max(2, payment.amount * scale), 0);
    if (totalHeight > targetHeight) maximum = scale;
    else minimum = scale;
  }

  return minimum;
}

function truncateLabel(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function getNodeLayout(nodes, edgeWidths, side, chartHeight) {
  const nodeHeights = new Map(nodes.map((node) => [node.id, 0]));
  edgeWidths.forEach(({ payment, width }) => {
    const memberId = side === 'from' ? payment.fromId : payment.toId;
    nodeHeights.set(memberId, nodeHeights.get(memberId) + width);
  });

  const totalHeight = nodes.reduce((sum, node) => sum + nodeHeights.get(node.id), 0) + NODE_GAP * (nodes.length - 1);
  let cursor = Math.max(CHART_MARGIN, (chartHeight - totalHeight) / 2);

  return new Map(nodes.map((node) => {
    const height = nodeHeights.get(node.id);
    const layout = { y: cursor, height, center: cursor + height / 2 };
    cursor += height + NODE_GAP;
    return [node.id, layout];
  }));
}

function getShortName(member, availableWidth) {
  return truncateLabel(getUserDisplayName(member), Math.floor(availableWidth / 6.5));
}

export default function DebtSankey({ members, payments }) {
  const chartRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(360);
  const [hoveredPayment, setHoveredPayment] = useState(null);
  const memberById = new Map(members.map((member) => [member.id, member]));
  const debtorIds = new Set(payments.map((payment) => payment.fromId));
  const creditorIds = new Set(payments.map((payment) => payment.toId));
  const debtors = members.filter((member) => debtorIds.has(member.id))
    .sort((first, second) => Math.abs(second.balance) - Math.abs(first.balance));
  const creditors = members.filter((member) => creditorIds.has(member.id))
    .sort((first, second) => second.balance - first.balance);
  useEffect(() => {
    const element = chartRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(([entry]) => {
      setChartWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [payments.length]);

  if (payments.length === 1) return null;

  if (!payments.length) {
    const hasOutstandingBalance = members.some((member) => Math.abs(Number(member.balance) || 0) >= 1);

    return (
      <section className="surface-card p-5">
        <h2 className="m-0 text-base font-semibold">{t('groupStatistics.debtTitle')}</h2>
        <div className="py-8 text-center">
          {hasOutstandingBalance ? null : <Check className="mx-auto h-7 w-7 text-[var(--success)]" aria-hidden="true" />}
          <p className="mb-0 mt-3 text-sm text-[var(--text-secondary)]">
            {t(hasOutstandingBalance ? 'groupStatistics.debtNoPayments' : 'groupStatistics.debtSettled')}
          </p>
        </div>
      </section>
    );
  }

  const maxNodeCount = Math.max(debtors.length, creditors.length);
  const chartHeight = Math.max(
    160,
    Math.min(320, 70 + payments.length * 35),
    maxNodeCount * 22 + CHART_MARGIN * 2,
  );
  const targetFlowHeight = chartHeight - CHART_MARGIN * 2 - NODE_GAP * (maxNodeCount - 1);
  const scale = getFlowWidthScale(payments, targetFlowHeight);
  const edgeWidths = payments.map((payment) => ({ payment, width: Math.max(2, payment.amount * scale) }));
  const debtorLayout = getNodeLayout(debtors, edgeWidths, 'from', chartHeight);
  const creditorLayout = getNodeLayout(creditors, edgeWidths, 'to', chartHeight);
  const linkSpan = Math.max(44, Math.min(480, 44 + (chartWidth - 360) * 0.8));
  const leftBarX = chartWidth / 2 - linkSpan / 2 - 7;
  const rightBarX = chartWidth / 2 + linkSpan / 2 + 7;
  const leftOffsets = new Map(debtors.map((member) => [member.id, 0]));
  const rightOffsets = new Map(creditors.map((member) => [member.id, 0]));
  const edgePaths = edgeWidths.map(({ payment, width }) => {
    const fromLayout = debtorLayout.get(payment.fromId);
    const toLayout = creditorLayout.get(payment.toId);
    const startY = fromLayout.y + leftOffsets.get(payment.fromId) + width / 2;
    const endY = toLayout.y + rightOffsets.get(payment.toId) + width / 2;
    leftOffsets.set(payment.fromId, leftOffsets.get(payment.fromId) + width);
    rightOffsets.set(payment.toId, rightOffsets.get(payment.toId) + width);
    const controlX = (leftBarX + rightBarX) / 2;

    return {
      payment,
      width,
      path: `M ${leftBarX + 7} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${rightBarX - 7} ${endY}`,
    };
  });
  const accessibleSummary = t('groupStatistics.debtChartAria', { count: payments.length });

  return (
    <section className="surface-card min-w-0 p-5">
      <h2 className="m-0 text-base font-semibold">{t('groupStatistics.debtTitle')}</h2>
      <div className="mt-4 flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--danger)]" />{t('groupStatistics.debtors')}</span>
        <span className="inline-flex items-center gap-2">{t('groupStatistics.creditors')}<span className="h-2.5 w-2.5 rounded-sm bg-[var(--success)]" /></span>
      </div>

      <div ref={chartRef} className="mt-2 w-full min-w-0">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          width="100%"
          height={chartHeight}
          className="block w-full"
          role="img"
          aria-label={accessibleSummary}
        >
          {edgePaths.map(({ payment, width, path }, index) => {
            const fromMember = memberById.get(payment.fromId);
            const toMember = memberById.get(payment.toId);
            const isHovered = hoveredPayment === index;
            const tooltip = t('groupStatistics.debtPaymentTooltip', {
              from: getUserDisplayName(fromMember),
              to: getUserDisplayName(toMember),
              amount: formatCurrency(payment.amount),
            });

            return (
              <path
                key={`${payment.fromId}-${payment.toId}-${index}`}
                d={path}
                fill="none"
                stroke="var(--danger)"
                strokeOpacity={isHovered ? 0.5 : 0.22}
                strokeWidth={width}
                tabIndex={0}
                onMouseEnter={() => setHoveredPayment(index)}
                onMouseLeave={() => setHoveredPayment(null)}
                onFocus={() => setHoveredPayment(index)}
                onBlur={() => setHoveredPayment(null)}
              >
                <title>{tooltip}</title>
              </path>
            );
          })}

          {[
            ...debtors.map((member) => ({ member, side: 'left', layout: debtorLayout.get(member.id) })),
            ...creditors.map((member) => ({ member, side: 'right', layout: creditorLayout.get(member.id) })),
          ].map(({ member, side, layout }) => {
            const isLeft = side === 'left';
            const barX = isLeft ? leftBarX : rightBarX;
            const avatarX = isLeft ? barX - 34 : barX + 22;
            const avatarY = layout.center - 10;
            const labelX = isLeft ? avatarX - 5 : avatarX + 25;
            const availableWidth = isLeft ? labelX - 6 : chartWidth - labelX - 6;
            const avatarUrl = getUserAvatarUrl(member);
            const clipId = `debt-avatar-${side}-${member.id}`;

            return (
              <g key={`${side}-${member.id}`}>
                <rect
                  x={barX}
                  y={layout.y}
                  width="14"
                  height={Math.max(2, layout.height)}
                  rx="3"
                  fill={isLeft ? 'var(--danger)' : 'var(--success)'}
                />
                <circle cx={avatarX + 10} cy={layout.center} r="10" fill="var(--app-surface-muted)" />
                {avatarUrl ? (
                  <>
                    <defs><clipPath id={clipId}><circle cx={avatarX + 10} cy={layout.center} r="10" /></clipPath></defs>
                    <image href={avatarUrl} x={avatarX} y={avatarY} width="20" height="20" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
                  </>
                ) : (
                  <text x={avatarX + 10} y={layout.center + 3} textAnchor="middle" fontSize="8" fill="var(--text-secondary)">{getUserInitials(member)}</text>
                )}
                <text x={labelX} y={layout.center - 1} textAnchor={isLeft ? 'end' : 'start'} fontSize="11" fontWeight="600" fill="var(--text-primary)">
                  {getShortName(member, availableWidth)}
                </text>
                <text x={labelX} y={layout.center + 12} textAnchor={isLeft ? 'end' : 'start'} fontSize="10" fontWeight="600" fill={isLeft ? 'var(--danger)' : 'var(--success)'}>
                  {formatCurrency(Math.abs(member.balance))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-2 min-h-4 text-xs text-[var(--text-secondary)]" aria-live="polite">
        {hoveredPayment === null ? '' : t('groupStatistics.debtPaymentTooltip', {
          from: getUserDisplayName(memberById.get(payments[hoveredPayment].fromId)),
          to: getUserDisplayName(memberById.get(payments[hoveredPayment].toId)),
          amount: formatCurrency(payments[hoveredPayment].amount),
        })}
      </p>

      <div className="sr-only">
        <h3>{t('groupStatistics.debtPaymentList')}</h3>
        <ul>
          {payments.map((payment, index) => (
            <li key={`${payment.fromId}-${payment.toId}-${index}`}>
              {getUserDisplayName(memberById.get(payment.fromId))} → {getUserDisplayName(memberById.get(payment.toId))}: {formatCurrency(payment.amount)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}