import fs from 'node:fs';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const databasePath = `./data/expense-route-tests-${process.pid}.db`;
process.env.DB_PATH = databasePath;
process.env.JWT_SECRET = 'expense-route-test-secret';

const { db, initializeDatabase } = await import('../../db/database.js');
const { signToken } = await import('../../auth/token.js');
const { default: expensesRouter } = await import('../expenses.js');

const userId = 94001;
const otherUserId = 94002;
let server;
let baseUrl;
let sessionToken;
let groupId;
let carCategoryId;
let foodCategoryId;

function insertUser(id, fullName, handle) {
  db.prepare(`
    INSERT INTO users (id, full_name, user_handle, is_placeholder)
    VALUES (?, ?, ?, 0)
  `).run(id, fullName, handle);
}

async function createExpense(payload) {
  const response = await fetch(`${baseUrl}/api/expenses/${groupId}`, {
    method: 'POST',
    headers: {
      Authorization: ['Bearer', sessionToken].join(' '),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return response;
}

async function updateExpense(expenseId, payload) {
  const response = await fetch(`${baseUrl}/api/expenses/${groupId}/${expenseId}`, {
    method: 'PUT',
    headers: {
      Authorization: ['Bearer', sessionToken].join(' '),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return response;
}

beforeAll(async () => {
  initializeDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api/expenses', expensesRouter);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  carCategoryId = db.prepare("SELECT id FROM expense_categories WHERE icon = 'car'").get().id;
  foodCategoryId = db.prepare("SELECT id FROM expense_categories WHERE icon != 'car' ORDER BY id ASC LIMIT 1").get().id;
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
  insertUser(userId, 'Route User', 'route-user');
  insertUser(otherUserId, 'Other User', 'other-user');
  const result = db.prepare(`
    INSERT INTO groups (name, slug, mileage_rate, created_by)
    VALUES ('Grupp', 'grupp', 20, ?)
  `).run(userId);
  groupId = Number(result.lastInsertRowid);
  db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, userId);
  db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, otherUserId);
  sessionToken = signToken(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
});

afterAll(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
});

describe('expense mileage persistence', () => {
  it('rejects car expenses without distance_mil instead of guessing it', async () => {
    const response = await createExpense({
      title: 'Bil ToR Sandviken',
      amount: 300,
      category_id: carCategoryId,
      paid_by_user_id: userId,
      notes: '15 mil × 20 kr/mil',
      occurred_at: '2026-09-28T09:50:00.000Z',
    });

    expect(response.status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS count FROM expenses').get().count).toBe(0);
  });

  it('rejects car expenses with zero distance_mil', async () => {
    const response = await createExpense({
      title: 'Bil 0 mil',
      amount: 225,
      category_id: carCategoryId,
      paid_by_user_id: userId,
      distance_mil: 0,
      occurred_at: '2026-09-28T09:50:00.000Z',
    });

    expect(response.status).toBe(400);
  });

  it('keeps the stored distance when an update to a car expense omits distance_mil', async () => {
    const created = await createExpense({
      title: 'Bil 12 mil',
      amount: 240,
      category_id: carCategoryId,
      paid_by_user_id: userId,
      distance_mil: 12,
      occurred_at: '2026-09-28T09:50:00.000Z',
    });
    const expense = await created.json();

    const updated = await updateExpense(expense.id, {
      title: 'Bil 12 mil',
      amount: 240,
      category_id: carCategoryId,
      paid_by_user_id: userId,
      notes: 'Ny anteckning',
      occurred_at: '2026-09-28T10:00:00.000Z',
    });

    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ id: expense.id, distance_mil: 12 });
  });

  it('rejects switching an expense to the car category without distance_mil', async () => {
    const created = await createExpense({
      title: 'Parkering',
      amount: 225,
      category_id: foodCategoryId,
      paid_by_user_id: userId,
      occurred_at: '2026-09-28T09:50:00.000Z',
    });
    const expense = await created.json();

    const updated = await updateExpense(expense.id, {
      title: 'Parkering',
      amount: 225,
      category_id: carCategoryId,
      paid_by_user_id: userId,
      occurred_at: '2026-09-28T09:50:00.000Z',
    });

    expect(updated.status).toBe(400);
  });

  it('stores explicit distance_mil updates and clears it for non-car categories', async () => {
    const created = await createExpense({
      title: 'Bil 12 mil',
      amount: 240,
      category_id: carCategoryId,
      paid_by_user_id: userId,
      distance_mil: 12,
      occurred_at: '2026-09-28T09:50:00.000Z',
    });
    const expense = await created.json();

    const updated = await updateExpense(expense.id, {
      title: 'Middag',
      amount: 240,
      category_id: foodCategoryId,
      paid_by_user_id: userId,
      notes: 'Ingen bilresa',
      occurred_at: '2026-09-28T10:00:00.000Z',
    });

    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      id: expense.id,
      category_id: foodCategoryId,
      distance_mil: null,
    });
  });

  it('rejects an explicit null distance_mil on a car expense', async () => {
    const created = await createExpense({
      title: 'Bil 12 mil',
      amount: 240,
      category_id: carCategoryId,
      paid_by_user_id: userId,
      distance_mil: 12,
      occurred_at: '2026-09-28T09:50:00.000Z',
    });
    const expense = await created.json();

    const updated = await updateExpense(expense.id, {
      title: 'Bil ToR Sandviken',
      amount: 240,
      category_id: carCategoryId,
      paid_by_user_id: userId,
      distance_mil: null,
      notes: 'Manuell justering',
      occurred_at: '2026-09-28T10:00:00.000Z',
    });

    expect(updated.status).toBe(400);
    expect(db.prepare('SELECT distance_mil FROM expenses WHERE id = ?').get(expense.id).distance_mil).toBe(12);
  });
});

describe('expense categories', () => {
  it('returns seeded descriptions so clients know what belongs in each category', async () => {
    const response = await fetch(`${baseUrl}/api/expenses/categories`, {
      headers: { Authorization: ['Bearer', sessionToken].join(' ') },
    });

    expect(response.status).toBe(200);
    const categories = await response.json();
    const car = categories.find((category) => category.icon === 'car');
    const travel = categories.find((category) => category.name === 'Resa');
    expect(car.description).toMatch(/Antal mil krävs/u);
    expect(travel.description).toMatch(/parkering/u);
  });

  it('does not overwrite descriptions changed by an admin when seeding again', () => {
    db.prepare("UPDATE expense_categories SET description = 'Egen text' WHERE name = 'Mat'").run();
    db.prepare("UPDATE expense_categories SET description = '' WHERE name = 'Dryck'").run();

    initializeDatabase();

    expect(db.prepare("SELECT description FROM expense_categories WHERE name = 'Mat'").get().description).toBe('Egen text');
    expect(db.prepare("SELECT description FROM expense_categories WHERE name = 'Dryck'").get().description).toBe('');
  });
});
