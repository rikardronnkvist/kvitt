const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_COLUMNS = 16;
const MAX_ROWS = 12;

function toDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfPeriod(date, granularity) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);

  if (granularity === 'week') {
    const day = result.getDay() || 7;
    result.setDate(result.getDate() - day + 1);
  } else if (granularity === 'month') {
    result.setDate(1);
  } else if (granularity === 'year') {
    result.setMonth(0, 1);
  }

  return result;
}

function addPeriod(date, granularity) {
  const result = new Date(date);
  if (granularity === 'day') result.setDate(result.getDate() + 1);
  else if (granularity === 'week') result.setDate(result.getDate() + 7);
  else if (granularity === 'month') result.setMonth(result.getMonth() + 1);
  else result.setFullYear(result.getFullYear() + 1);
  return result;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calendarDayDifference(first, last) {
  const firstUtc = Date.UTC(first.getFullYear(), first.getMonth(), first.getDate());
  const lastUtc = Date.UTC(last.getFullYear(), last.getMonth(), last.getDate());
  return Math.round((lastUtc - firstUtc) / DAY_MS);
}

function countPeriods(first, last, granularity) {
  let count = 0;
  for (let cursor = startOfPeriod(first, granularity); cursor <= startOfPeriod(last, granularity); cursor = addPeriod(cursor, granularity)) {
    count += 1;
  }
  return count;
}

function chooseGranularity(first, last) {
  const days = calendarDayDifference(first, last);
  let granularity = days <= 14 ? 'day' : days <= 90 ? 'week' : 'month';
  const coarser = { day: 'week', week: 'month', month: 'year' };

  while (countPeriods(first, last, granularity) > MAX_COLUMNS && coarser[granularity]) {
    granularity = coarser[granularity];
  }
  return granularity;
}

function formatColumnLabel(date, granularity, includeYear) {
  if (granularity === 'day') {
    return date.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'numeric' });
  }
  if (granularity === 'week') {
    const thursday = new Date(date);
    thursday.setDate(thursday.getDate() + 3);
    const yearStart = new Date(thursday.getFullYear(), 0, 1);
    const week = Math.ceil((((thursday - yearStart) / DAY_MS) + 1) / 7);
    return `v.${week}`;
  }
  if (granularity === 'year') return String(date.getFullYear());
  return date.toLocaleDateString('sv-SE', includeYear
    ? { month: 'short', year: 'numeric' }
    : { month: 'short' });
}

function displayName(person) {
  return String(person?.full_name || person?.name || person?.initials || '').trim();
}

function getRowInfo(expense, dimension, person, categoryInfo) {
  if (dimension === 'category') {
    const categoryName = expense.category_name || 'Ingen kategori';
    const key = String(expense.category_id ?? `name:${categoryName}`);
    const info = categoryInfo.get(key) || {};
    return { key, label: categoryName, iconId: expense.category_icon || info.iconId || 'shapes' };
  }

  return {
    key: String(person.id),
    label: displayName(person) || `#${person.id}`,
    member: person,
  };
}

function makeEmptyRow(info, columnCount) {
  return { ...info, values: Array(columnCount).fill(0), counts: Array(columnCount).fill(0), total: 0 };
}

function addValue(row, columnIndex, amount) {
  row.values[columnIndex] += amount;
  row.counts[columnIndex] += 1;
  row.total += amount;
}

function combineRows(rows, columnCount) {
  const other = makeEmptyRow({ key: 'other', label: `Övriga (${rows.length} st)`, isOther: true }, columnCount);
  for (const row of rows) {
    row.values.forEach((value, index) => {
      other.values[index] += value;
      other.counts[index] += row.counts[index];
    });
    other.total += row.total;
  }
  return other;
}

export function buildHeatmap(expenses, {
  dimension = 'category',
  measure = 'paid',
  granularity = 'auto',
  members = [],
} = {}) {
  const datedExpenses = expenses
    .map((expense) => ({ expense, date: toDate(expense.occurred_at || expense.created_at) }))
    .filter(({ date }) => date);

  if (!datedExpenses.length) {
    return { granularity: granularity === 'auto' ? 'month' : granularity, columns: [], rows: [], columnTotals: [], grandTotal: 0, max: 0 };
  }

  const first = datedExpenses.reduce((earliest, item) => item.date < earliest ? item.date : earliest, datedExpenses[0].date);
  const last = datedExpenses.reduce((latest, item) => item.date > latest ? item.date : latest, datedExpenses[0].date);
  let selectedGranularity = granularity === 'auto' ? chooseGranularity(first, last) : granularity;
  const coarser = { day: 'week', week: 'month', month: 'year' };
  while (countPeriods(first, last, selectedGranularity) > MAX_COLUMNS && coarser[selectedGranularity]) {
    selectedGranularity = coarser[selectedGranularity];
  }

  const firstPeriod = startOfPeriod(first, selectedGranularity);
  const lastPeriod = startOfPeriod(last, selectedGranularity);
  const spansYearBoundary = first.getFullYear() !== last.getFullYear();
  const columns = [];
  const columnIndexByKey = new Map();
  for (let cursor = new Date(firstPeriod); cursor <= lastPeriod; cursor = addPeriod(cursor, selectedGranularity)) {
    const next = addPeriod(cursor, selectedGranularity);
    const key = dateKey(cursor);
    columnIndexByKey.set(key, columns.length);
    columns.push({
      key,
      label: formatColumnLabel(cursor, selectedGranularity, spansYearBoundary),
      start: key,
      end: dateKey(new Date(next.getTime() - DAY_MS)),
    });
  }

  const memberById = new Map(members.map((member) => [String(member.id), member]));
  const memberMetadata = new Map(memberById);
  const categoryInfo = new Map();
  for (const { expense } of datedExpenses) {
    const categoryKey = String(expense.category_id ?? `name:${expense.category_name || 'Ingen kategori'}`);
    categoryInfo.set(categoryKey, { iconId: expense.category_icon || 'shapes' });
    const payerId = String(expense.paid_by_user_id ?? '');
    if (payerId && !memberMetadata.has(payerId)) {
      memberMetadata.set(payerId, {
        id: expense.paid_by_user_id,
        full_name: expense.paid_by_full_name,
        initials: expense.paid_by_initials,
        avatar_url: expense.paid_by_avatar_url,
      });
    }
    for (const split of expense.splits || []) {
      const splitId = String(split.user_id ?? '');
      if (splitId && !memberMetadata.has(splitId)) {
        memberMetadata.set(splitId, {
          id: split.user_id,
          full_name: split.full_name,
          initials: split.initials,
          avatar_url: split.avatar_url,
        });
      }
    }
  }

  const rowsByKey = new Map();
  for (const { expense, date } of datedExpenses) {
    const columnIndex = columnIndexByKey.get(dateKey(startOfPeriod(date, selectedGranularity)));
    const amount = Math.round(Number(expense.amount) || 0);
    if (dimension === 'category') {
      const info = getRowInfo(expense, dimension, null, categoryInfo);
      if (!rowsByKey.has(info.key)) rowsByKey.set(info.key, makeEmptyRow(info, columns.length));
      addValue(rowsByKey.get(info.key), columnIndex, amount);
      continue;
    }

    const recipients = measure === 'cost'
      ? (expense.splits || []).map((split) => ({ person: memberMetadata.get(String(split.user_id)) || split, amount: Math.round(Number(split.amount_owed) || 0) }))
      : [{ person: memberMetadata.get(String(expense.paid_by_user_id)) || { id: expense.paid_by_user_id, full_name: expense.paid_by_full_name }, amount }];
    for (const recipient of recipients) {
      if (!recipient.person?.id || recipient.amount <= 0) continue;
      const info = getRowInfo(expense, dimension, recipient.person, categoryInfo);
      if (!rowsByKey.has(info.key)) rowsByKey.set(info.key, makeEmptyRow(info, columns.length));
      addValue(rowsByKey.get(info.key), columnIndex, recipient.amount);
    }
  }

  let rows = Array.from(rowsByKey.values()).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'sv-SE'));
  if (rows.length > MAX_ROWS) {
    rows = [...rows.slice(0, MAX_ROWS - 1), combineRows(rows.slice(MAX_ROWS - 1), columns.length)];
  }
  const columnTotals = columns.map((_, index) => rows.reduce((sum, row) => sum + row.values[index], 0));
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);
  const max = rows.reduce((largest, row) => Math.max(largest, ...row.values), 0);

  return { granularity: selectedGranularity, columns, rows, columnTotals, grandTotal, max };
}