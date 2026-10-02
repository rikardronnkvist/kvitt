const MINIMUM_BALANCE_CENTS = 100;

export function simplifyDebts(balances) {
  const debtors = [];
  const creditors = [];

  for (const member of balances || []) {
    const balanceCents = Math.round(Number(member.balance) * 100);
    if (!Number.isFinite(balanceCents) || Math.abs(balanceCents) < MINIMUM_BALANCE_CENTS) continue;

    if (balanceCents < 0) {
      debtors.push({ id: member.memberId, remaining: -balanceCents });
    } else {
      creditors.push({ id: member.memberId, remaining: balanceCents });
    }
  }

  debtors.sort((first, second) => second.remaining - first.remaining);
  creditors.sort((first, second) => second.remaining - first.remaining);

  const payments = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountCents = Math.min(debtor.remaining, creditor.remaining);

    payments.push({
      fromId: debtor.id,
      toId: creditor.id,
      amount: amountCents / 100,
    });

    debtor.remaining -= amountCents;
    creditor.remaining -= amountCents;

    if (debtor.remaining === 0) debtorIndex += 1;
    if (creditor.remaining === 0) creditorIndex += 1;
  }

  return payments;
}