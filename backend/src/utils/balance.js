import { db } from '../db/database.js';

function toParticipant(member) {
  return {
    id: member.id,
    full_name: member.full_name,
    phone: member.phone ?? null,
    is_placeholder: member.is_placeholder ?? 0,
  };
}

function createSignature(transactions) {
  return transactions
    .map((transaction) => `${transaction.from.id}:${transaction.to.id}:${transaction.amount}`)
    .join('|');
}

function compareSolutions(candidate, currentBest) {
  if (!currentBest) {
    return -1;
  }

  if (candidate.count !== currentBest.count) {
    return candidate.count - currentBest.count;
  }

  // Prefer larger, fewer chunks when the number of transfers is identical.
  if (candidate.fragmentationScore !== currentBest.fragmentationScore) {
    return currentBest.fragmentationScore - candidate.fragmentationScore;
  }

  if (candidate.signature < currentBest.signature) {
    return -1;
  }
  if (candidate.signature > currentBest.signature) {
    return 1;
  }

  return 0;
}

function buildSortedCreditorIndices(creditBalances, creditors) {
  return creditBalances
    .map((v, i) => i)
    .filter((i) => creditBalances[i] > 0)
    .sort((a, b) => {
      if (creditBalances[b] !== creditBalances[a]) return creditBalances[b] - creditBalances[a];
      return creditors[a].participant.id - creditors[b].participant.id;
    });
}

export function calculateOptimalTransactionsFromMembers(members) {
  const creditors = members
    .filter((member) => Number(member.balance) > 0)
    .map((member) => ({
      participant: toParticipant(member),
      remaining: Math.round(Number(member.balance)),
    }))
    .sort((a, b) => {
      if (b.remaining !== a.remaining) {
        return b.remaining - a.remaining;
      }
      return a.participant.id - b.participant.id;
    });

  const debtors = members
    .filter((member) => Number(member.balance) < 0)
    .map((member) => ({
      participant: toParticipant(member),
      remaining: Math.round(Math.abs(Number(member.balance))),
    }))
    .sort((a, b) => {
      if (b.remaining !== a.remaining) {
        return b.remaining - a.remaining;
      }
      return a.participant.id - b.participant.id;
    });

  if (!creditors.length || !debtors.length) {
    return [];
  }

  const totalCredit = creditors.reduce((sum, creditor) => sum + creditor.remaining, 0);
  const totalDebt = debtors.reduce((sum, debtor) => sum + debtor.remaining, 0);
  if (totalCredit !== totalDebt) {
    const error = new Error('Kunde inte beräkna kvittningar: saldon summerar inte till noll.');
    error.status = 500;
    throw error;
  }

  const creditorBalances = creditors.map((creditor) => creditor.remaining);
  const memo = new Map();
  let best = null;

  const nextDebtorIndex = (startIndex, debtBalances) => {
    let index = startIndex;
    while (index < debtBalances.length && debtBalances[index] <= 0) {
      index += 1;
    }
    return index;
  };

  const getLowerBound = (debtorIndex, debtBalances, creditBalances) => {
    let remainingDebtors = 0;
    for (let index = debtorIndex; index < debtBalances.length; index += 1) {
      if (debtBalances[index] > 0) {
        remainingDebtors += 1;
      }
    }

    let remainingCreditors = 0;
    for (const value of creditBalances) {
      if (value > 0) {
        remainingCreditors += 1;
      }
    }

    return Math.max(remainingDebtors, remainingCreditors);
  };

  const search = ({ debtorIndex, debtBalances, creditBalances, transactions, txCount, fragmentationScore }) => {
    const activeDebtorIndex = nextDebtorIndex(debtorIndex, debtBalances);
    if (activeDebtorIndex >= debtBalances.length) {
      const candidate = {
        count: txCount,
        fragmentationScore,
        signature: createSignature(transactions),
        transactions,
      };
      if (compareSolutions(candidate, best) < 0) {
        best = candidate;
      }
      return;
    }

    const lowerBound = getLowerBound(activeDebtorIndex, debtBalances, creditBalances);
    if (best && txCount + lowerBound > best.count) {
      return;
    }

    const memoKey = `${activeDebtorIndex}|${debtBalances.slice(activeDebtorIndex).join(',')}|${creditBalances.join(',')}`;
    const memoBest = memo.get(memoKey);
    if (memoBest !== undefined && memoBest <= txCount) {
      return;
    }
    memo.set(memoKey, txCount);

    const debtorRemaining = debtBalances[activeDebtorIndex];
      const candidateCreditors = buildSortedCreditorIndices(creditBalances, creditors);
    for (const creditorIndex of candidateCreditors) {
      const creditorRemaining = creditBalances[creditorIndex];
      const amount = Math.min(debtorRemaining, creditorRemaining);
      if (amount <= 0) {
        continue;
      }

      const nextDebtBalances = [...debtBalances];
      const nextCreditBalances = [...creditBalances];

      nextDebtBalances[activeDebtorIndex] = debtorRemaining - amount;
      nextCreditBalances[creditorIndex] = creditorRemaining - amount;

      const nextTransactions = [
        ...transactions,
        {
          from: debtors[activeDebtorIndex].participant,
          to: creditors[creditorIndex].participant,
          amount,
        },
      ];

      if (best && txCount + 1 > best.count) {
        continue;
      }

      search({
        debtorIndex: activeDebtorIndex,
        debtBalances: nextDebtBalances,
        creditBalances: nextCreditBalances,
        transactions: nextTransactions,
        txCount: txCount + 1,
        fragmentationScore: fragmentationScore + amount * amount,
      });
    }
  };

  search({
    debtorIndex: 0,
    debtBalances: debtors.map((debtor) => debtor.remaining),
    creditBalances: creditorBalances,
    transactions: [],
    txCount: 0,
    fragmentationScore: 0,
  });

  return best?.transactions ?? [];
}

export function calculateMemberBalances(groupId) {
  const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(groupId);
  if (!group) {
    const error = new Error('Gruppen hittades inte.');
    error.status = 404;
    throw error;
  }

  const members = db.prepare(`
    SELECT u.id, u.full_name, u.phone, u.is_placeholder
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

  for (const [userId, balance] of balanceMap.entries()) {
    const rounded = Math.round(balance);
    const member = memberMap.get(userId);
    if (!member) {
      continue;
    }
    member.balance = rounded;
  }

  return Array.from(memberMap.values()).map((member) => ({
    ...member,
    balance: Math.round(member.balance || 0),
  }));
}

export function calculateBalances(groupId) {
  const members = calculateMemberBalances(groupId);
  return calculateOptimalTransactionsFromMembers(members);
}
