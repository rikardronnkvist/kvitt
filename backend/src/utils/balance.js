import { db } from '../db/database.js';

export function calculateMemberBalances(groupId) {
  const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(groupId);
  if (!group) {
    const error = new Error('Gruppen hittades inte.');
    error.status = 404;
    throw error;
  }

  const members = db.prepare(`
    SELECT u.id, u.full_name, u.phone
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY COALESCE(NULLIF(TRIM(u.full_name), ''), CAST(u.id AS TEXT)) COLLATE NOCASE
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
    const rounded = Math.round(balance);
    const member = memberMap.get(userId);
    if (!member) {
      continue;
    }
    member.balance = rounded;

    if (rounded > 0) {
      creditors.push({ ...member, balance: rounded });
    } else if (rounded < 0) {
      debtors.push({ ...member, balance: Math.abs(rounded) });
    }
  }

  return Array.from(memberMap.values()).map((member) => ({
    ...member,
    balance: Math.round(member.balance || 0),
  }));
}

export function calculateBalances(groupId) {
  const members = calculateMemberBalances(groupId);
  const creditors = members
    .filter((member) => member.balance > 0)
    .map((member) => ({ ...member, balance: member.balance }));
  const debtors = members
    .filter((member) => member.balance < 0)
    .map((member) => ({ ...member, balance: Math.abs(member.balance) }));

  creditors.sort((a, b) => b.balance - a.balance);
  debtors.sort((a, b) => b.balance - a.balance);

  const transactions = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.balance, debtor.balance);
    const roundedAmount = Math.round(amount);

    if (roundedAmount > 0) {
      transactions.push({
        from: {
          id: debtor.id,
          full_name: debtor.full_name,
          phone: debtor.phone ?? null,
        },
        to: {
          id: creditor.id,
          full_name: creditor.full_name,
          phone: creditor.phone ?? null,
        },
        amount: roundedAmount,
      });
    }

    creditor.balance = Math.round(creditor.balance - roundedAmount);
    debtor.balance = Math.round(debtor.balance - roundedAmount);

    if (creditor.balance <= 0) {
      creditorIndex += 1;
    }
    if (debtor.balance <= 0) {
      debtorIndex += 1;
    }
  }

  return transactions;
}
