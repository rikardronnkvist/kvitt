export function computeMemberBalances(members, expenses, settlements) {
  const balanceMap = new Map(members.map((member) => [member.id, 0]));

  expenses.forEach((expense) => {
    balanceMap.set(
      expense.paid_by_user_id,
      (balanceMap.get(expense.paid_by_user_id) || 0) + Number(expense.amount),
    );

    expense.splits.forEach((split) => {
      balanceMap.set(split.user_id, (balanceMap.get(split.user_id) || 0) - Number(split.amount_owed));
    });
  });

  settlements.forEach((settlement) => {
    balanceMap.set(settlement.payer_id, (balanceMap.get(settlement.payer_id) || 0) + Number(settlement.amount));
    balanceMap.set(settlement.receiver_id, (balanceMap.get(settlement.receiver_id) || 0) - Number(settlement.amount));
  });

  return members
    .map((member) => ({
      ...member,
      balance: Math.round(balanceMap.get(member.id) || 0),
    }))
    .sort((a, b) => b.balance - a.balance);
}
