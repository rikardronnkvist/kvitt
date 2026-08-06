import { getUserDisplayName } from './users.js';
import { getDefaultCategoryId } from './expenseCategories.js';
import { t } from './i18n.js';

function toLocalDateTimeInputValue(input) {
  const date = input ? new Date(input) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (value) => String(value).padStart(2, '0');
  return `${safeDate.getFullYear()}-${pad(safeDate.getMonth() + 1)}-${pad(safeDate.getDate())}T${pad(safeDate.getHours())}:${pad(safeDate.getMinutes())}`;
}

function parseLocalDateTimeInput(value) {
  const input = String(value || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(input);
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

function deriveSplitType(expense, members) {
  if (expense && !hasEqualSplits(expense.amount, expense.splits)) return 'custom';
  if (expense && expense.splits.length < members.length) return 'equal';
  return 'all_equal';
}

export function createExpenseForm({ members, categories = [], currentUserId, defaultPaidByUserId, expense }) {
  const defaultPayerId = defaultPaidByUserId && members.some((member) => String(member.id) === String(defaultPaidByUserId))
    ? String(defaultPaidByUserId)
    : members.some((member) => String(member.id) === currentUserId)
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
  const customPercentages = Object.fromEntries(members.map((member) => [member.id, '']));

  return {
    title: expense?.title || '',
    amount: expense ? String(Math.round(expense.amount)) : '',
    currency: expense?.currency || 'SEK',
    category_id: String(expense?.category_id ?? getDefaultCategoryId(categories) ?? ''),
    paid_by_user_id: String(expense?.paid_by_user_id || defaultPayerId),
    notes: expense?.notes || '',
    occurred_at: toLocalDateTimeInputValue(expense?.occurred_at || expense?.created_at),
    distance_mil: '',
    split_type: deriveSplitType(expense, members),
    included_users: includedUsers,
    custom_amounts: customAmounts,
    custom_percentages: customPercentages,
  };
}

export function getSplitSummary(form, members) {
  const amount = Number(form.amount);
  const selectedMembers = form.split_type === 'all_equal' || form.split_type === 'custom'
    ? members
    : getSelectedMembers(members, form.included_users);
  const hasValidAmount = Number.isInteger(amount) && amount > 0;
  const equalSplits = hasValidAmount ? buildEqualSplits(amount, selectedMembers) : [];
  const customTotal = selectedMembers.reduce((sum, member) => sum + Number(form.custom_amounts[member.id] || 0), 0);
  const percentTotal = members.reduce((sum, member) => sum + Number(form.custom_percentages?.[member.id] || 0), 0);
  const percentSplits = hasValidAmount && percentTotal > 0
    ? (() => {
        const raw = members.map((member) => ({
          user_id: member.id,
          amount_owed: Math.floor(amount * Number(form.custom_percentages?.[member.id] || 0) / 100),
        }));
        const diff = amount - raw.reduce((s, r) => s + r.amount_owed, 0);
        // distribute remainder to the first members with a non-zero percentage
        let rem = diff;
        return raw.map((r) => {
          if (rem > 0 && r.amount_owed > 0) { rem--; return { ...r, amount_owed: r.amount_owed + 1 }; }
          return r;
        });
      })()
    : [];

  return {
    amount,
    hasValidAmount,
    selectedMembers,
    equalSplits,
    customTotal,
    customDifference: hasValidAmount ? amount - customTotal : null,
    percentTotal,
    percentSplits,
    percentDifference: 100 - percentTotal,
  };
}

export function buildExpensePayload(form, members) {
  const { amount, selectedMembers, customDifference, percentDifference, percentSplits } = getSplitSummary(form, members);
  const categoryId = Number(form.category_id);

  if (!selectedMembers.length) {
    throw new Error(t('expenseForm.selectOneMember'));
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(t('expenseForm.amountMustBePositiveInteger'));
  }

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    throw new Error(t('expenseForm.selectCategory'));
  }

  let splits;
  if (form.split_type === 'percent') {
    if (percentDifference !== 0) {
      throw new Error(t('expenseForm.customSharesMustMatch'));
    }
    splits = percentSplits.filter((s) => s.amount_owed > 0);
    if (!splits.length) {
      throw new Error(t('expenseForm.selectOneMember'));
    }
  } else if (form.split_type === 'custom') { // eslint-disable-line no-lonely-if
    splits = selectedMembers.map((member) => {
      const owed = Number(form.custom_amounts[member.id]);
      if (!Number.isInteger(owed) || owed <= 0) {
        throw new Error(t('expenseForm.invalidCustomAmount', { name: getUserDisplayName(member) }));
      }
      return {
        user_id: member.id,
        amount_owed: owed,
      };
    });

    if (customDifference !== 0) {
      throw new Error(t('expenseForm.customSharesMustMatch'));
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
        throw new Error(t('expenseForm.invalidDateTime'));
      }
      return occurredAt.toISOString();
    })(),
    splits,
  };
}
