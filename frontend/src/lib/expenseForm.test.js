import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExpensePayload, createExpenseForm } from './expenseForm.js';

const categories = [
  { id: 1, name: 'Övrigt', icon: 'shapes' },
  { id: 2, name: 'Bil', icon: 'car' },
];

const members = [
  { id: 1, full_name: 'A' },
  { id: 2, full_name: 'B' },
];

test('createExpenseForm derives distance_mil for car expenses from notes when not stored', () => {
  const form = createExpenseForm({
    members,
    categories,
    mileageRate: 20,
    expense: {
      title: 'Bil ToR Sandviken',
      amount: 300,
      category_id: 2,
      paid_by_user_id: 1,
      splits: [{ user_id: 1, amount_owed: 150 }, { user_id: 2, amount_owed: 150 }],
      notes: '15 mil × 20 kr/mil',
      occurred_at: '2026-09-28T09:50:00.000Z',
      created_at: '2026-09-28T09:50:00.000Z',
    },
  });

  assert.equal(form.distance_mil, '15');
});

test('buildExpensePayload includes distance_mil for car expenses', () => {
  const payload = buildExpensePayload({
    title: 'Bil 15 mil',
    amount: '300',
    currency: 'SEK',
    category_id: '2',
    paid_by_user_id: '1',
    notes: 'ToR Sandviken',
    occurred_at: '2026-09-28T09:50',
    distance_mil: '15',
    split_type: 'all_equal',
    included_users: { 1: true, 2: true },
    custom_amounts: { 1: '', 2: '' },
    custom_percentages: { 1: '', 2: '' },
  }, members, categories, 20);

  assert.equal(payload.distance_mil, 15);
});
