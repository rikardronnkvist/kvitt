import { getUserDisplayName } from './users.js';
import { getDefaultCategoryId } from './expenseCategories.js';

function toLocalDateTimeInputValue(input) {
  const date = input ? new Date(input) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (value) => String(value).padStart(2, '0');
  return `${safeDate.getFullYear()}-${pad(safeDate.getMonth() + 1)}-${pad(safeDate.getDate())}T${pad(safeDate.getHours())}:${pad(safeDate.getMinutes())}`;
}

function parseLocalDateTimeInput(value) {
  const input = String(value || '').trim();
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    Number.isNaN(parsed.getTime())
    || parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
    || parsed.getHours() !== hour
    || parsed.getMinutes() !== minute
  ) {
    return null;
  }

  return parsed;
}

export function buildEqualSplits(amount, splitMembers) {
  if (!splitMembers.length) return [];
  const totalAmount = Math.round(Number(amount));
  const baseAmount = Math.floor(totalAmount / splitMembers.length);
  let remainder = totalAmount - baseAmount * splitMembers.length;

  return splitMembers.map((member) => {
    const extraAmount = remainder > 0 ? 1 : 0;
    remainder -= extraAmount;
    return {
      user_id: member.id,
      amount_owed: baseAmount + extraAmount,
    };
  });
}

export function getSelectedMembers(members, includedUsers) {
  return members.filter((member) => includedUsers[member.id] !== false);
}

function hasEqualSplits(amount, splits) {
  if (!splits?.length) return true;
  const expected = buildEqualSplits(amount, splits.map((split) => ({ id: split.user_id })));
  return splits.every((split, index) => Number(split.amount_owed) === Number(expected[index].amount_owed));
}

export function createExpenseForm({ members, categories = [], currentUserId, expense }) {
  const defaultPayerId = members.some((member) => String(member.id) === currentUserId)
    ? currentUserId
    : String(expense?.paid_by_user_id || members[0]?.id || '');

  const includedUsers = Object.fromEntries(
    members.map((member) => [
      member.id,
      expense ? expense.splits.some((split) => split.user_id === member.id) : true,
    ]),
  );
  const customAmounts = Object.fromEntries(
    members.map((member) => {
      const split = expense?.splits.find((item) => item.user_id === member.id);
      return [member.id, split?.amount_owed != null ? String(Math.round(split.amount_owed)) : ''];
    }),
  );

  return {
    title: expense?.title || '',
    amount: expense ? String(Math.round(expense.amount)) : '',
    currency: expense?.currency || 'SEK',
    category_id: String(expense?.category_id ?? getDefaultCategoryId(categories) ?? ''),
    paid_by_user_id: String(expense?.paid_by_user_id || defaultPayerId),
    notes: expense?.notes || '',
    occurred_at: toLocalDateTimeInputValue(expense?.occurred_at || expense?.created_at),
    distance_mil: '',
    split_type: expense && !hasEqualSplits(expense.amount, expense.splits) ? 'custom' : 'equal',
    included_users: includedUsers,
    custom_amounts: customAmounts,
  };
}

export function getSplitSummary(form, members) {
  const amount = Number(form.amount);
  const selectedMembers = getSelectedMembers(members, form.included_users);
  const hasValidAmount = Number.isInteger(amount) && amount > 0;
  const equalSplits = hasValidAmount ? buildEqualSplits(amount, selectedMembers) : [];
  const customTotal = selectedMembers.reduce((sum, member) => sum + Number(form.custom_amounts[member.id] || 0), 0);

  return {
    amount,
    hasValidAmount,
    selectedMembers,
    equalSplits,
    customTotal,
    customDifference: hasValidAmount ? amount - customTotal : null,
  };
}

export function buildExpensePayload(form, members) {
  const { amount, selectedMembers, customDifference } = getSplitSummary(form, members);
  const categoryId = Number(form.category_id);

  if (!selectedMembers.length) {
    throw new Error('Välj minst en person att dela utgiften med.');
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Belopp måste vara ett heltal större än 0.');
  }

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    throw new Error('Välj en kategori för utgiften.');
  }

  let splits;
  if (form.split_type === 'custom') {
    splits = selectedMembers.map((member) => {
      const owed = Number(form.custom_amounts[member.id]);
      if (!Number.isInteger(owed) || owed <= 0) {
        throw new Error(`Ange ett giltigt heltalsbelopp för ${getUserDisplayName(member)}.`);
      }
      return {
        user_id: member.id,
        amount_owed: owed,
      };
    });

    if (customDifference !== 0) {
      throw new Error('Summan av egna andelar måste motsvara utgiftens totalbelopp.');
    }
  } else {
    splits = buildEqualSplits(amount, selectedMembers);
  }

  return {
    title: form.title,
    amount,
    currency: form.currency || 'SEK',
    category_id: categoryId,
    paid_by_user_id: Number(form.paid_by_user_id),
    notes: form.notes || null,
    occurred_at: (() => {
      const occurredAt = parseLocalDateTimeInput(form.occurred_at);
      if (!occurredAt) {
        throw new Error('Ange ett giltigt datum och tid.');
      }
      return occurredAt.toISOString();
    })(),
    splits,
  };
}
