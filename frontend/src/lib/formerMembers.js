function appendFormerParticipant(result, knownIds, participant, formatName) {
  if (participant.id == null || knownIds.has(String(participant.id))) {
    return;
  }
  knownIds.add(String(participant.id));
  result.push({
    ...participant,
    full_name: formatName(participant.full_name),
    is_former_member: true,
  });
}

// Former members stay selectable when editing entries they already take part in.
export function withFormerExpenseParticipants(members, expense, formatName = (name) => name) {
  if (!expense) {
    return members;
  }
  const result = [...members];
  const knownIds = new Set(members.map((member) => String(member.id)));
  appendFormerParticipant(result, knownIds, {
    id: expense.paid_by_user_id,
    full_name: expense.paid_by_full_name,
    initials: expense.paid_by_initials,
    avatar_url: expense.paid_by_avatar_url,
  }, formatName);
  for (const split of expense.splits ?? []) {
    appendFormerParticipant(result, knownIds, {
      id: split.user_id,
      full_name: split.full_name,
      initials: split.initials,
      avatar_url: split.avatar_url,
    }, formatName);
  }
  return result.length === members.length ? members : result;
}

export function withFormerSettlementParticipants(members, settlement, formatName = (name) => name) {
  if (!settlement) {
    return members;
  }
  const result = [...members];
  const knownIds = new Set(members.map((member) => String(member.id)));
  appendFormerParticipant(result, knownIds, {
    id: settlement.payer_id,
    full_name: settlement.payer_full_name,
    initials: settlement.payer_initials,
    avatar_url: settlement.payer_avatar_url,
  }, formatName);
  appendFormerParticipant(result, knownIds, {
    id: settlement.receiver_id,
    full_name: settlement.receiver_full_name,
    initials: settlement.receiver_initials,
    avatar_url: settlement.receiver_avatar_url,
  }, formatName);
  return result.length === members.length ? members : result;
}
