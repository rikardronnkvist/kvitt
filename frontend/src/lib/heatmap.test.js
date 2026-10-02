import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHeatmap } from './heatmap.js';

function expense(date, overrides = {}) {
  return {
    occurred_at: `${date}T12:00:00`,
    amount: 100,
    category_id: 1,
    category_name: 'Mat',
    category_icon: 'utensils',
    paid_by_user_id: 1,
    paid_by_full_name: 'Anna',
    splits: [{ user_id: 1, full_name: 'Anna', amount_owed: 40 }, { user_id: 2, full_name: 'Bo', amount_owed: 60 }],
    ...overrides,
  };
}

test('chooses day, week, and month granularity at the requested boundaries', () => {
  assert.equal(buildHeatmap([expense('2026-01-01'), expense('2026-01-15')]).granularity, 'day');
  assert.equal(buildHeatmap([expense('2026-01-01'), expense('2026-01-16')]).granularity, 'week');
  assert.equal(buildHeatmap([expense('2026-01-01'), expense('2026-04-01')]).granularity, 'week');
  assert.equal(buildHeatmap([expense('2026-01-01'), expense('2026-04-02')]).granularity, 'month');
});

test('includes empty periods and coarsens when more than sixteen columns are needed', () => {
  const daily = buildHeatmap([expense('2026-01-01'), expense('2026-01-03')]);
  assert.equal(daily.columns.length, 3);
  assert.equal(daily.rows[0].values[1], 0);
  const longSpan = buildHeatmap([expense('2020-01-01'), expense('2026-01-01')]);
  assert.equal(longSpan.granularity, 'year');
});

test('aggregates category amounts and paid member amounts, excluding settlement data', () => {
  const expenses = [
    expense('2026-02-01'),
    expense('2026-02-01', { amount: 250, category_id: 2, category_name: 'Boende', category_icon: 'house' }),
  ];
  const categories = buildHeatmap(expenses, { dimension: 'category' });
  assert.deepEqual(categories.rows.map((row) => [row.label, row.total]), [['Boende', 250], ['Mat', 100]]);
  assert.equal(categories.grandTotal, 350);
  const paid = buildHeatmap(expenses, { dimension: 'member' });
  assert.equal(paid.grandTotal, 350);
  assert.equal(paid.rows[0].label, 'Anna');
});

test('uses existing split amounts for member cost and preserves the group total', () => {
  const result = buildHeatmap([expense('2026-03-01'), expense('2026-03-02')], { dimension: 'member', measure: 'cost' });
  assert.deepEqual(result.rows.map((row) => [row.label, row.total]), [['Bo', 120], ['Anna', 80]]);
  assert.equal(result.grandTotal, 200);
});

test('combines rows beyond twelve into the remaining row', () => {
  const expenses = Array.from({ length: 13 }, (_, index) => expense('2026-04-01', {
    category_id: index + 1,
    category_name: `Kategori ${index + 1}`,
    amount: index + 1,
  }));
  const result = buildHeatmap(expenses);
  assert.equal(result.rows.length, 12);
  assert.equal(result.rows.at(-1).label, 'Övriga (2 st)');
  assert.equal(result.grandTotal, 91);
});