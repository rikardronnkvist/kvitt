import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

function resolveDbPath() {
  const preferredPath = process.env.DB_PATH || '/app/data/kvitt.db';

  try {
    fs.mkdirSync(path.dirname(preferredPath), { recursive: true });
    fs.accessSync(path.dirname(preferredPath), fs.constants.W_OK);
    return preferredPath;
  } catch {
    const fallbackPath = path.resolve(process.cwd(), 'data', 'kvitt.db');
    fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
    return fallbackPath;
  }
}

const dbPath = resolveDbPath();

export const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

export function usersTableHasUsernameColumn() {
  return db.prepare('PRAGMA table_info(users)').all().some((column) => column.name === 'username');
}

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      theme_color TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'SEK',
      paid_by_user_id INTEGER NOT NULL REFERENCES users(id),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expense_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount_owed REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      payer_id INTEGER NOT NULL REFERENCES users(id),
      receiver_id INTEGER NOT NULL REFERENCES users(id),
      amount REAL NOT NULL,
      settled_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_group_id ON expenses(group_id);
    CREATE INDEX IF NOT EXISTS idx_expense_splits_expense_id ON expense_splits(expense_id);
    CREATE INDEX IF NOT EXISTS idx_settlements_group_id ON settlements(group_id);
  `);

  const userColumns = db.prepare('PRAGMA table_info(users)').all();
  const hasIsAdminColumn = userColumns.some((column) => column.name === 'is_admin');
  if (!hasIsAdminColumn) {
    db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
  }

  const hasFullNameColumn = userColumns.some((column) => column.name === 'full_name');
  if (!hasFullNameColumn) {
    db.exec('ALTER TABLE users ADD COLUMN full_name TEXT');
  }

  const hasInitialsColumn = userColumns.some((column) => column.name === 'initials');
  if (!hasInitialsColumn) {
    db.exec('ALTER TABLE users ADD COLUMN initials TEXT');
  }

  const adminCount = db.prepare('SELECT COUNT(*) AS count FROM users WHERE is_admin = 1').get();
  if (Number(adminCount.count) === 0) {
    const firstUser = db.prepare('SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1').get();
    if (firstUser) {
      db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(firstUser.id);
    }
  }

  const groupColumns = db.prepare('PRAGMA table_info(groups)').all();
  if (!groupColumns.some((c) => c.name === 'theme_color')) {
    db.exec('ALTER TABLE groups ADD COLUMN theme_color TEXT');
  }
}
