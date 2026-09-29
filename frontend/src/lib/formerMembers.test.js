import assert from 'node:assert/strict';
import test from 'node:test';
import { withFormerExpenseParticipants, withFormerSettlementParticipants } from './formerMembers.js';

const members = [
  { id: 1, full_name: 'Anna' },
  { id: 2, full_name: 'Bertil' },
];
const markFormer = (name) => `${name} (tidigare)`;

test('returns the member list unchanged when every participant is a member', () => {
  const expense = {
    paid_by_user_id: 1,
    paid_by_full_name: 'Anna',
    splits: [{ user_id: 1, full_name: 'Anna' }, { user_id: 2, full_name: 'Bertil' }],
  };

  assert.equal(withFormerExpenseParticipants(members, expense, markFormer), members);
});

test('adds former expense participants once, marked as former members', () => {
  const expense = {
    paid_by_user_id: 3,
    paid_by_full_name: 'Cecilia',
    paid_by_initials: 'CE',
    paid_by_avatar_url: null,
    splits: [
      { user_id: 1, full_name: 'Anna' },
      { user_id: 3, full_name: 'Cecilia' },
      { user_id: 4, full_name: 'David', initials: 'DA', avatar_url: '/a.png' },
    ],
  };

  const result = withFormerExpenseParticipants(members, expense, markFormer);

  assert.deepEqual(result.slice(2), [
    { id: 3, full_name: 'Cecilia (tidigare)', initials: 'CE', avatar_url: null, is_former_member: true },
    { id: 4, full_name: 'David (tidigare)', initials: 'DA', avatar_url: '/a.png', is_former_member: true },
  ]);
  assert.equal(members.length, 2);
});

test('adds a former settlement receiver', () => {
  const settlement = {
    payer_id: 1,
    payer_full_name: 'Anna',
    receiver_id: 5,
    receiver_full_name: 'Erik',
  };

  const result = withFormerSettlementParticipants(members, settlement, markFormer);

  assert.deepEqual(result.map((member) => member.id), [1, 2, 5]);
  assert.equal(result[2].full_name, 'Erik (tidigare)');
});
