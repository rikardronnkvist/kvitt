import { describe, expect, it } from 'vitest';
import { calculateOptimalTransactionsFromMembers } from '../balance.js';

function createMember(id, balance) {
  return {
    id,
    full_name: `User ${id}`,
    phone: null,
    is_placeholder: 0,
    balance,
  };
}

function greedyCountForMembers(members) {
  const creditors = members
    .filter((member) => member.balance > 0)
    .map((member) => ({ ...member, balance: member.balance }))
    .sort((a, b) => b.balance - a.balance);

  const debtors = members
    .filter((member) => member.balance < 0)
    .map((member) => ({ ...member, balance: Math.abs(member.balance) }))
    .sort((a, b) => b.balance - a.balance);

  let creditorIndex = 0;
  let debtorIndex = 0;
  let transactionCount = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.balance, debtor.balance);

    if (amount > 0) {
      transactionCount += 1;
    }

    creditor.balance -= amount;
    debtor.balance -= amount;

    if (creditor.balance <= 0) {
      creditorIndex += 1;
    }
    if (debtor.balance <= 0) {
      debtorIndex += 1;
    }
  }

  return transactionCount;
}

function computeFragmentationScore(transactions) {
  return transactions.reduce((sum, transaction) => sum + transaction.amount * transaction.amount, 0);
}

describe('calculateOptimalTransactionsFromMembers', () => {
  it('returns empty list when everyone is settled', () => {
    const transactions = calculateOptimalTransactionsFromMembers([
      createMember(1, 0),
      createMember(2, 0),
      createMember(3, 0),
    ]);

    expect(transactions).toEqual([]);
  });

  it('matches simple one-to-one settlements', () => {
    const transactions = calculateOptimalTransactionsFromMembers([
      createMember(1, -300),
      createMember(2, 100),
      createMember(3, 200),
    ]);

    expect(transactions).toHaveLength(2);
    expect(transactions.reduce((sum, tx) => sum + tx.amount, 0)).toBe(300);
    expect(transactions.every((tx) => tx.amount > 0)).toBe(true);
  });

  it('finds fewer transactions than greedy in a known counterexample', () => {
    const members = [
      createMember(1, -6),
      createMember(2, -6),
      createMember(3, 1),
      createMember(4, 1),
      createMember(5, 5),
      createMember(6, 5),
    ];

    const optimalTransactions = calculateOptimalTransactionsFromMembers(members);
    const greedyCount = greedyCountForMembers(members);

    expect(greedyCount).toBe(5);
    expect(optimalTransactions).toHaveLength(4);
  });

  it('uses tie-breaker to minimize fragmentation when transfer count is equal', () => {
    const members = [
      createMember(1, -1),
      createMember(2, -6),
      createMember(3, 2),
      createMember(4, 2),
      createMember(5, 3),
    ];

    const transactions = calculateOptimalTransactionsFromMembers(members);

    expect(transactions).toHaveLength(4);
    expect(computeFragmentationScore(transactions)).toBe(15);
    expect(transactions).toEqual([
      {
        from: { id: 2, full_name: 'User 2', phone: null, is_placeholder: 0 },
        to: { id: 5, full_name: 'User 5', phone: null, is_placeholder: 0 },
        amount: 3,
      },
      {
        from: { id: 2, full_name: 'User 2', phone: null, is_placeholder: 0 },
        to: { id: 3, full_name: 'User 3', phone: null, is_placeholder: 0 },
        amount: 2,
      },
      {
        from: { id: 2, full_name: 'User 2', phone: null, is_placeholder: 0 },
        to: { id: 4, full_name: 'User 4', phone: null, is_placeholder: 0 },
        amount: 1,
      },
      {
        from: { id: 1, full_name: 'User 1', phone: null, is_placeholder: 0 },
        to: { id: 4, full_name: 'User 4', phone: null, is_placeholder: 0 },
        amount: 1,
      },
    ]);
  });
});
