import assert from 'node:assert/strict';
import test from 'node:test';
import { simplifyDebts } from './simplifyDebts.js';

test('greedily simplifies the provided group balances into seven payments', () => {
  const payments = simplifyDebts([
    { memberId: 1, balance: -278 },
    { memberId: 2, balance: 378 },
    { memberId: 3, balance: -1373 },
    { memberId: 4, balance: -220 },
    { memberId: 5, balance: 83 },
    { memberId: 6, balance: -688 },
    { memberId: 7, balance: 286 },
    { memberId: 8, balance: 1812 },
  ]);

  assert.deepEqual(payments, [
    { fromId: 3, toId: 8, amount: 1373 },
    { fromId: 6, toId: 8, amount: 439 },
    { fromId: 6, toId: 2, amount: 249 },
    { fromId: 1, toId: 2, amount: 129 },
    { fromId: 1, toId: 7, amount: 149 },
    { fromId: 4, toId: 7, amount: 137 },
    { fromId: 4, toId: 5, amount: 83 },
  ]);
  assert.equal(payments.reduce((sum, payment) => sum + payment.amount, 0), 2559);
});

test('returns no payments when all balances are zero', () => {
  assert.deepEqual(simplifyDebts([
    { memberId: 1, balance: 0 },
    { memberId: 2, balance: 0 },
  ]), []);
});

test('matches one debtor against multiple creditors', () => {
  assert.deepEqual(simplifyDebts([
    { memberId: 1, balance: -10 },
    { memberId: 2, balance: 6 },
    { memberId: 3, balance: 4 },
  ]), [
    { fromId: 1, toId: 2, amount: 6 },
    { fromId: 1, toId: 3, amount: 4 },
  ]);
});

test('handles rounding imbalance and sub-krona balances without throwing', () => {
  assert.deepEqual(simplifyDebts([
    { memberId: 1, balance: -10.005 },
    { memberId: 2, balance: 6 },
    { memberId: 3, balance: 3.99 },
    { memberId: 4, balance: 0.50 },
  ]), [
    { fromId: 1, toId: 2, amount: 6 },
    { fromId: 1, toId: 3, amount: 3.99 },
  ]);
});