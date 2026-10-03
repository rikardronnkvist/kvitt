import fs from 'node:fs';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const databasePath = `./data/group-route-tests-${process.pid}.db`;
process.env.DB_PATH = databasePath;
process.env.JWT_SECRET = 'group-route-test-secret';

const { db, initializeDatabase } = await import('../../db/database.js');
const { signToken } = await import('../../auth/token.js');
const { default: groupsRouter } = await import('../groups.js');

const userId = 93001;
const otherUserId = 93002;
let server;
let baseUrl;
let sessionToken;
let groupAId;
let groupBId;

function insertGroup(name, createdAt) {
  const result = db.prepare(`
    INSERT INTO groups (name, slug, created_by, created_at)
    VALUES (?, ?, ?, ?)
  `).run(name, name.toLowerCase().replaceAll(' ', '-'), userId, createdAt);
  const groupId = Number(result.lastInsertRowid);
  db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, userId);
  db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, otherUserId);
  return groupId;
}

function insertExpense(groupId, occurredAt, paidByUserId = userId) {
  db.prepare(`
    INSERT INTO expenses (group_id, title, amount, paid_by_user_id, occurred_at, created_at)
    VALUES (?, 'Testutgift', 100, ?, ?, ?)
  `).run(groupId, paidByUserId, occurredAt, occurredAt);
}

function insertActivity(groupId, actorUserId, createdAt, eventType = 'expense.created') {
  db.prepare(`
    INSERT INTO activity_logs (
      event_type, action, actor_user_id, group_id, entity_type, created_at
    )
    VALUES (?, 'create', ?, ?, 'expense', ?)
  `).run(eventType, actorUserId, groupId, createdAt);
}

async function listGroups() {
  const response = await fetch(`${baseUrl}/api/groups`, {
    headers: { Authorization: ['Bearer', sessionToken].join(' ') },
  });
  expect(response.status).toBe(200);
  return response.json();
}

async function createGroup(body) {
  const response = await fetch(`${baseUrl}/api/groups`, {
    method: 'POST',
    headers: {
      Authorization: ['Bearer', sessionToken].join(' '),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  initializeDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/groups', groupsRouter);
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
  db.prepare(`
    INSERT INTO users (id, full_name, user_handle, is_placeholder)
    VALUES (?, 'Route User', 'route-user', 0)
  `).run(userId);
  db.prepare(`
    INSERT INTO users (id, full_name, user_handle, is_placeholder)
    VALUES (?, 'Other User', 'other-user', 0)
  `).run(otherUserId);
  groupAId = insertGroup('Grupp A', '2026-01-01 10:00:00');
  groupBId = insertGroup('Grupp B', '2026-01-02 10:00:00');
  sessionToken = signToken(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
});

afterAll(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
});

describe('POST /api/groups', () => {
  it('adds uniquely matching users and creates claimable placeholders for other names', async () => {
    const response = await createGroup({
      name: 'New group',
      member_names: ['  OTHER USER  ', 'Guest Person'],
    });

    expect(response.status).toBe(201);
    const memberships = db.prepare(`
      SELECT u.id, u.full_name, u.is_placeholder
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY u.id
    `).all(response.body.id);
    expect(memberships).toEqual([
      { id: userId, full_name: 'Route User', is_placeholder: 0 },
      { id: otherUserId, full_name: 'Other User', is_placeholder: 0 },
      expect.objectContaining({ full_name: 'Guest Person', is_placeholder: 1 }),
    ]);
  });

  it('still creates groups when no member names are provided', async () => {
    const response = await createGroup({ name: 'Solo group' });

    expect(response.status).toBe(201);
    expect(db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(response.body.id))
      .toEqual([{ user_id: userId }]);
  });

  it('keeps ambiguous names as placeholders instead of linking an arbitrary account', async () => {
    db.prepare(`
      INSERT INTO users (id, full_name, user_handle, is_placeholder)
      VALUES (93003, 'Other User', 'another-other-user', 0)
    `).run();

    const response = await createGroup({ name: 'Ambiguous group', member_names: ['Other User'] });

    expect(response.status).toBe(201);
    const members = db.prepare(`
      SELECT u.id, u.full_name, u.is_placeholder
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY u.id
    `).all(response.body.id);
    expect(members).toHaveLength(2);
    expect(members[0]).toMatchObject({ id: userId, is_placeholder: 0 });
    expect(members[1]).toMatchObject({ full_name: 'Other User', is_placeholder: 1 });
  });
});

describe('GET /api/groups default group', () => {
  it('marks the group with the latest expense written by the user as default', async () => {
    insertExpense(groupAId, '2026-02-01 10:00:00');
    insertActivity(groupAId, userId, '2026-02-01 10:00:00');
    insertExpense(groupBId, '2026-02-02 10:00:00');
    insertActivity(groupBId, userId, '2026-02-02 10:00:00');

    const groups = await listGroups();

    expect(groups.find((group) => group.id === groupAId).is_default).toBe(false);
    expect(groups.find((group) => group.id === groupBId)).toMatchObject({
      is_default: true,
      last_used_by_me_at: '2026-02-02 10:00:00',
    });
  });

  it("ignores another member's later expense activity", async () => {
    insertExpense(groupBId, '2026-02-02 10:00:00');
    insertActivity(groupBId, userId, '2026-02-02 10:00:00');
    insertExpense(groupAId, '2026-02-03 10:00:00', otherUserId);
    insertActivity(groupAId, otherUserId, '2026-02-03 10:00:00');

    const groups = await listGroups();

    expect(groups.find((group) => group.id === groupBId).is_default).toBe(true);
    expect(groups.find((group) => group.id === groupAId).last_used_by_me_at).toBeNull();
  });

  it('falls back to the next active group when the latest group is archived', async () => {
    insertActivity(groupAId, userId, '2026-02-01 10:00:00');
    insertActivity(groupBId, userId, '2026-02-02 10:00:00');
    db.prepare("UPDATE groups SET archived_at = '2026-02-03 10:00:00' WHERE id = ?").run(groupBId);

    const groups = await listGroups();

    expect(groups.find((group) => group.id === groupAId).is_default).toBe(true);
    expect(groups.find((group) => group.id === groupBId).is_default).toBe(false);
  });

  it('uses the first active group in the existing sort order without user activity', async () => {
    insertExpense(groupAId, '2026-02-03 10:00:00', otherUserId);
    insertExpense(groupBId, '2026-02-02 10:00:00', otherUserId);

    const groups = await listGroups();

    expect(groups[0].id).toBe(groupAId);
    expect(groups[0].is_default).toBe(true);
    expect(groups.filter((group) => group.is_default)).toHaveLength(1);
  });

  it('uses a newer settlement for last_activity_at', async () => {
    insertExpense(groupAId, '2026-02-01 10:00:00');
    db.prepare(`
      INSERT INTO settlements (group_id, payer_id, receiver_id, amount, settled_at)
      VALUES (?, ?, ?, 100, '2026-02-04 10:00:00')
    `).run(groupAId, userId, otherUserId);

    const groups = await listGroups();

    expect(groups.find((group) => group.id === groupAId).last_activity_at)
      .toBe('2026-02-04 10:00:00');
  });
});
