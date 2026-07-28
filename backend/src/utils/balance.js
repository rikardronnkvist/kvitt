import { db } from '../db/database.js';

const EPSILON = 0.01;

export function calculateBalances(groupId) {
  const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(groupId);
  if (!group) {
    const error = new Error('Gruppen hittades inte.');
    error.status = 404;
    throw error;
  }

  const members = db.prepare(`
    SELECT u.id, u.username
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY u.username COLLATE NOCASE
  `).all(groupId);

  const balanceMap = new Map(members.map((member) => [member.id, 0]));
  const memberMap = new Map(members.map((member) => [member.id, member]));

  const expenses = db.prepare(`
    SELECT e.id, e.amount, e.paid_by_user_id, es.user_id, es.amount_owed
    FROM expenses e
    JOIN expense_splits es ON es.expense_id = e.id
    WHERE e.group_id = ?
  `).all(groupId);

  const expenseCredits = new Set();
  for (const row of expenses) {
    if (!expenseCredits.has(row.id)) {
      balanceMap.set(
        row.paid_by_user_id,
        (balanceMap.get(row.paid_by_user_id) || 0) + Number(row.amount),
      );
      expenseCredits.add(row.id);
    }
    balanceMap.set(row.user_id, (balanceMap.get(row.user_id) || 0) - Number(row.amount_owed));
  }

  const settlements = db.prepare(`
    SELECT payer_id, receiver_id, amount
    FROM settlements
    WHERE group_id = ?
  `).all(groupId);

  for (const settlement of settlements) {
    balanceMap.set(settlement.payer_id, (balanceMap.get(settlement.payer_id) || 0) + Number(settlement.amount));
    balanceMap.set(settlement.receiver_id, (balanceMap.get(settlement.receiver_id) || 0) - Number(settlement.amount));
  }

  const creditors = [];
  const debtors = [];

  for (const [userId, balance] of balanceMap.entries()) {
    const rounded = Math.round(balance * 100) / 100;
    if (rounded > EPSILON) {
      creditors.push({ ...memberMap.get(userId), balance: rounded });
    } else if (rounded < -EPSILON) {
      debtors.push({ ...memberMap.get(userId), balance: Math.abs(rounded) });
    }
  }

  creditors.sort((a, b) => b.balance - a.balance);
  debtors.sort((a, b) => b.balance - a.balance);

  const transactions = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.balance, debtor.balance);
    const roundedAmount = Math.round(amount * 100) / 100;

    if (roundedAmount > EPSILON) {
      transactions.push({
        from: { id: debtor.id, username: debtor.username },
        to: { id: creditor.id, username: creditor.username },
        amount: roundedAmount,
      });
    }

    creditor.balance = Math.round((creditor.balance - roundedAmount) * 100) / 100;
    debtor.balance = Math.round((debtor.balance - roundedAmount) * 100) / 100;

    if (creditor.balance <= EPSILON) {
      creditorIndex += 1;
    }
    if (debtor.balance <= EPSILON) {
      debtorIndex += 1;
    }
  }

  return transactions;
}
