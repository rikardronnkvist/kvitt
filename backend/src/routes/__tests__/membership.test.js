import fs from 'node:fs';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const databasePath = `./data/membership-route-tests-${process.pid}.db`;
process.env.DB_PATH = databasePath;
process.env.JWT_SECRET = 'membership-route-test-secret';

const { db, initializeDatabase } = await import('../../db/database.js');
const { signToken } = await import('../../auth/token.js');
const { default: groupsRouter } = await import('../groups.js');
const { default: expensesRouter } = await import('../expenses.js');
const { default: settlementsRouter } = await import('../settlements.js');

const ownerId = 95001;
const memberId = 95002;
const thirdMemberId = 95003;
let server;
let baseUrl;
let groupId;

function insertUser(id, fullName, handle) {
  db.prepare(`
    INSERT INTO users (id, full_name, user_handle, is_placeholder)
    VALUES (?, ?, ?, 0)
  `).run(id, fullName, handle);
}

function tokenFor(userId) {
  return signToken(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
}

function insertExpense({ paidBy, amount, splits }) {
  const result = db.prepare(`
    INSERT INTO expenses (group_id, title, amount, paid_by_user_id, occurred_at)
    VALUES (?, 'Middag', ?, ?, '2026-09-01 18:00:00')
  `).run(groupId, amount, paidBy);
  const expenseId = Number(result.lastInsertRowid);
  for (const [userId, amountOwed] of splits) {
    db.prepare('INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES (?, ?, ?)').run(expenseId, userId, amountOwed);
  }
  return expenseId;
}

function insertSettlement({ payer, receiver, amount }) {
  const result = db.prepare(`
    INSERT INTO settlements (group_id, payer_id, receiver_id, amount, settled_at)
    VALUES (?, ?, ?, ?, '2026-09-02 18:00:00')
  `).run(groupId, payer, receiver, amount);
  return Number(result.lastInsertRowid);
}

function isMember(userId) {
  return Boolean(db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId));
}

async function request(method, path, userId, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: ['Bearer', tokenFor(userId)].join(' '),
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

// Member pays a 100 kr dinner split evenly with the owner and the owner pays back 50 kr,
// leaving the member with transactions but a zero balance.
function createSettledHistoryForMember() {
  const expenseId = insertExpense({ paidBy: memberId, amount: 100, splits: [[ownerId, 50], [memberId, 50]] });
  const settlementId = insertSettlement({ payer: ownerId, receiver: memberId, amount: 50 });
  return { expenseId, settlementId };
}

beforeAll(async () => {
  initializeDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/groups', groupsRouter);
  app.use('/api/expenses', expensesRouter);
  app.use('/api/settlements', settlementsRouter);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  db.exec(`
    DELETE FROM activity_logs;
    DELETE FROM expense_splits;
    DELETE FROM settlements;
    DELETE FROM expenses;
    DELETE FROM group_members;
    DELETE FROM groups;
    DELETE FROM users;
  `);
  insertUser(ownerId, 'Owner User', 'owner-user');
  insertUser(memberId, 'Member User', 'member-user');
  insertUser(thirdMemberId, 'Third User', 'third-user');
  const result = db.prepare(`
    INSERT INTO groups (name, slug, created_by)
    VALUES ('Resan', 'resan', ?)
  `).run(ownerId);
  groupId = Number(result.lastInsertRowid);
  for (const userId of [ownerId, memberId, thirdMemberId]) {
    db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, userId);
  }
});

afterAll(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
});

describe('POST /api/groups/:id/leave', () => {
  it('lets a member with transactions but a zero balance leave', async () => {
    createSettledHistoryForMember();

    const response = await request('POST', `/api/groups/${groupId}/leave`, memberId);

    expect(response.status).toBe(204);
    expect(isMember(memberId)).toBe(false);
    const log = db.prepare("SELECT actor_user_id, target_user_id FROM activity_logs WHERE event_type = 'group.member.left'").get();
    expect(log).toEqual({ actor_user_id: memberId, target_user_id: memberId });
  });

  it('rejects leaving with a non-zero balance', async () => {
    insertExpense({ paidBy: memberId, amount: 100, splits: [[ownerId, 50], [memberId, 50]] });

    const response = await request('POST', `/api/groups/${groupId}/leave`, memberId);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Du måste ha balans 0 för att kunna lämna gruppen.');
    expect(isMember(memberId)).toBe(true);
  });

  it('rejects the group owner leaving', async () => {
    const response = await request('POST', `/api/groups/${groupId}/leave`, ownerId);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Gruppens ägare kan inte lämna gruppen.');
    expect(isMember(ownerId)).toBe(true);
  });

  it('rejects the last member leaving', async () => {
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id != ?').run(groupId, memberId);

    const response = await request('POST', `/api/groups/${groupId}/leave`, memberId);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Den sista medlemmen kan inte lämna gruppen.');
    expect(isMember(memberId)).toBe(true);
  });

  it('rejects leaving an archived group', async () => {
    db.prepare("UPDATE groups SET archived_at = '2026-09-03 10:00:00' WHERE id = ?").run(groupId);

    const response = await request('POST', `/api/groups/${groupId}/leave`, memberId);

    expect(response.status).toBe(409);
    expect(isMember(memberId)).toBe(true);
  });
});

describe('DELETE /api/groups/:id/members/:userId', () => {
  it('lets the owner remove a member with transactions but a zero balance', async () => {
    createSettledHistoryForMember();

    const response = await request('DELETE', `/api/groups/${groupId}/members/${memberId}`, ownerId);

    expect(response.status).toBe(204);
    expect(isMember(memberId)).toBe(false);
    const log = db.prepare("SELECT actor_user_id, target_user_id FROM activity_logs WHERE event_type = 'group.member.removed'").get();
    expect(log).toEqual({ actor_user_id: ownerId, target_user_id: memberId });
  });

  it('rejects removing a member with a non-zero balance', async () => {
    insertExpense({ paidBy: ownerId, amount: 100, splits: [[ownerId, 50], [memberId, 50]] });

    const response = await request('DELETE', `/api/groups/${groupId}/members/${memberId}`, ownerId);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Medlemmen måste ha balans 0 för att kunna tas bort.');
    expect(isMember(memberId)).toBe(true);
  });

  it('rejects removal by a member who is not the owner', async () => {
    const response = await request('DELETE', `/api/groups/${groupId}/members/${thirdMemberId}`, memberId);

    expect(response.status).toBe(403);
    expect(isMember(thirdMemberId)).toBe(true);
  });

  it('rejects removing the group owner', async () => {
    const response = await request('DELETE', `/api/groups/${groupId}/members/${ownerId}`, ownerId);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Gruppens ägare kan inte tas bort.');
    expect(isMember(ownerId)).toBe(true);
  });

  it('returns 404 for a user who is not a member', async () => {
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, thirdMemberId);

    const response = await request('DELETE', `/api/groups/${groupId}/members/${thirdMemberId}`, ownerId);

    expect(response.status).toBe(404);
  });
});

describe('history involving former members', () => {
  async function leaveWithSettledHistory() {
    const ids = createSettledHistoryForMember();
    const response = await request('POST', `/api/groups/${groupId}/leave`, memberId);
    expect(response.status).toBe(204);
    return ids;
  }

  it('allows editing an expense without changing the former member balance', async () => {
    const { expenseId } = await leaveWithSettledHistory();

    const response = await request('PUT', `/api/expenses/${groupId}/${expenseId}`, ownerId, {
      title: 'Middag på krogen',
      amount: 100,
      paid_by_user_id: memberId,
      occurred_at: '2026-09-01T18:00',
      splits: [{ user_id: ownerId, amount_owed: 50 }, { user_id: memberId, amount_owed: 50 }],
    });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe('Middag på krogen');
  });

  it('rejects editing an expense in a way that changes the former member balance', async () => {
    const { expenseId } = await leaveWithSettledHistory();

    const response = await request('PUT', `/api/expenses/${groupId}/${expenseId}`, ownerId, {
      title: 'Middag',
      amount: 100,
      paid_by_user_id: memberId,
      occurred_at: '2026-09-01T18:00',
      splits: [{ user_id: ownerId, amount_owed: 40 }, { user_id: memberId, amount_owed: 60 }],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Ändringen skulle påverka balansen för en person som inte längre är medlem i gruppen.');
  });

  it('still rejects adding a non-member to an expense', async () => {
    const expenseId = insertExpense({ paidBy: ownerId, amount: 100, splits: [[ownerId, 50], [thirdMemberId, 50]] });
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, memberId);

    const response = await request('PUT', `/api/expenses/${groupId}/${expenseId}`, ownerId, {
      title: 'Middag',
      amount: 100,
      paid_by_user_id: ownerId,
      occurred_at: '2026-09-01T18:00',
      splits: [{ user_id: ownerId, amount_owed: 50 }, { user_id: memberId, amount_owed: 50 }],
    });

    expect(response.status).toBe(400);
  });

  it('rejects deleting an expense that affects a former member', async () => {
    const { expenseId } = await leaveWithSettledHistory();

    const response = await request('DELETE', `/api/expenses/${groupId}/${expenseId}`, ownerId);

    expect(response.status).toBe(400);
    expect(db.prepare('SELECT 1 FROM expenses WHERE id = ?').get(expenseId)).toBeTruthy();
  });

  it('allows editing a settlement without changing the former member balance', async () => {
    const { settlementId } = await leaveWithSettledHistory();

    const response = await request('PUT', `/api/settlements/${groupId}/${settlementId}`, ownerId, {
      payer_id: ownerId,
      receiver_id: memberId,
      amount: 50,
      settled_at: '2026-09-02T19:00',
    });

    expect(response.status).toBe(200);
  });

  it('rejects changing a settlement amount for a former member', async () => {
    const { settlementId } = await leaveWithSettledHistory();

    const response = await request('PUT', `/api/settlements/${groupId}/${settlementId}`, ownerId, {
      payer_id: ownerId,
      receiver_id: memberId,
      amount: 60,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Ändringen skulle påverka balansen för en person som inte längre är medlem i gruppen.');
  });

  it('rejects deleting a settlement that affects a former member', async () => {
    const { settlementId } = await leaveWithSettledHistory();

    const response = await request('DELETE', `/api/settlements/${groupId}/${settlementId}`, ownerId);

    expect(response.status).toBe(400);
    expect(db.prepare('SELECT 1 FROM settlements WHERE id = ?').get(settlementId)).toBeTruthy();
  });

  it('keeps group balances consistent after a member leaves', async () => {
    await leaveWithSettledHistory();

    const response = await request('GET', `/api/settlements/${groupId}/balances`, ownerId);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});
