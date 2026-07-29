import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureRegistrationAccessToken } from '../utils/settings.js';

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

function ensureUsersSchemaForPasskeys() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const userColumns = db.prepare('PRAGMA table_info(users)').all();
  const getColumn = (name) => userColumns.find((column) => column.name === name);
  const hasColumn = (name) => Boolean(getColumn(name));

  const hasTargetColumns = ['email', 'password_hash', 'created_at', 'is_admin', 'full_name', 'phone', 'initials', 'user_handle']
    .every((name) => hasColumn(name));
  const hasNullableEmail = hasColumn('email') && getColumn('email').notnull === 0;
  const hasNullablePassword = hasColumn('password_hash') && getColumn('password_hash').notnull === 0;
  const hasUserHandleConstraint = hasColumn('user_handle') && getColumn('user_handle').notnull === 1;

  if (hasTargetColumns && hasNullableEmail && hasNullablePassword && hasUserHandleConstraint) {
    return;
  }

  const selectEmail = hasColumn('email') ? 'NULLIF(email, \'\')' : 'NULL';
  const selectPasswordHash = hasColumn('password_hash') ? 'NULLIF(password_hash, \'\')' : 'NULL';
  const selectCreatedAt = hasColumn('created_at') ? 'COALESCE(created_at, CURRENT_TIMESTAMP)' : 'CURRENT_TIMESTAMP';
  const selectIsAdmin = hasColumn('is_admin') ? 'COALESCE(is_admin, 0)' : '0';
  const selectFullName = hasColumn('full_name') ? 'full_name' : 'NULL';
  const selectPhone = hasColumn('phone') ? 'NULLIF(phone, \'\')' : 'NULL';
  const selectInitials = hasColumn('initials') ? 'initials' : 'NULL';
  const selectUserHandle = hasColumn('user_handle')
    ? 'COALESCE(NULLIF(user_handle, \'\'), \'legacy-\' || id)'
    : '\'legacy-\' || id';

  db.exec('PRAGMA foreign_keys = OFF');
  const migrateUsersTable = db.transaction(() => {
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_admin INTEGER NOT NULL DEFAULT 0,
        full_name TEXT,
        phone TEXT,
        initials TEXT,
        user_handle TEXT UNIQUE NOT NULL
      );
    `);

    db.exec(`
      INSERT INTO users_new (id, email, password_hash, created_at, is_admin, full_name, phone, initials, user_handle)
      SELECT
        id,
        ${selectEmail},
        ${selectPasswordHash},
        ${selectCreatedAt},
        ${selectIsAdmin},
        ${selectFullName},
        ${selectPhone},
        ${selectInitials},
        ${selectUserHandle}
      FROM users;
    `);

    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_new RENAME TO users');
  });

  try {
    migrateUsersTable();
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }

  const duplicateUserHandles = db.prepare(`
    SELECT user_handle
    FROM users
    GROUP BY user_handle
    HAVING COUNT(*) > 1
  `).all();

  if (duplicateUserHandles.length > 0) {
    const updateHandle = db.prepare('UPDATE users SET user_handle = ? WHERE id = ?');
    const rows = db.prepare('SELECT id, user_handle FROM users ORDER BY id ASC').all();
    for (const row of rows) {
      const conflict = db.prepare('SELECT id FROM users WHERE user_handle = ? AND id != ?').get(row.user_handle, row.id);
      if (conflict) {
        updateHandle.run(`legacy-${row.id}-${randomUUID()}`, row.id);
      }
    }
  }
}

export function initializeDatabase() {
  ensureUsersSchemaForPasskeys();

  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      theme_color TEXT,
      mileage_rate REAL NOT NULL DEFAULT 20,
      created_by INTEGER NOT NULL REFERENCES users(id),
      archived_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'SEK',
      category_id INTEGER REFERENCES expense_categories(id),
      paid_by_user_id INTEGER NOT NULL REFERENCES users(id),
      notes TEXT,
      occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

    CREATE TABLE IF NOT EXISTS passkeys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL UNIQUE,
      name TEXT,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      device_type TEXT NOT NULL,
      backed_up INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_group_id ON expenses(group_id);
    CREATE INDEX IF NOT EXISTS idx_expense_splits_expense_id ON expense_splits(expense_id);
    CREATE INDEX IF NOT EXISTS idx_settlements_group_id ON settlements(group_id);
    CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON passkeys(user_id);
    CREATE INDEX IF NOT EXISTS idx_passkeys_credential_id ON passkeys(credential_id);
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

  const hasPhoneColumn = userColumns.some((column) => column.name === 'phone');
  if (!hasPhoneColumn) {
    db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
  }

  const hasInitialsColumn = userColumns.some((column) => column.name === 'initials');
  if (!hasInitialsColumn) {
    db.exec('ALTER TABLE users ADD COLUMN initials TEXT');
  }

  const hasUserHandleColumn = userColumns.some((column) => column.name === 'user_handle');
  if (!hasUserHandleColumn) {
    db.exec('ALTER TABLE users ADD COLUMN user_handle TEXT');
  }
  db.exec('UPDATE users SET user_handle = COALESCE(NULLIF(user_handle, \'\'), \'legacy-\' || id)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_user_handle ON users(user_handle)');

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
  if (!groupColumns.some((c) => c.name === 'mileage_rate')) {
    db.exec('ALTER TABLE groups ADD COLUMN mileage_rate REAL NOT NULL DEFAULT 20');
  }
  if (!groupColumns.some((c) => c.name === 'archived_at')) {
    db.exec('ALTER TABLE groups ADD COLUMN archived_at DATETIME');
  }
  db.exec('UPDATE groups SET mileage_rate = 20 WHERE mileage_rate IS NULL OR mileage_rate <= 0');

  const expenseColumns = db.prepare('PRAGMA table_info(expenses)').all();
  if (!expenseColumns.some((column) => column.name === 'category_id')) {
    db.exec('ALTER TABLE expenses ADD COLUMN category_id INTEGER REFERENCES expense_categories(id)');
  }
  if (!expenseColumns.some((column) => column.name === 'occurred_at')) {
    db.exec('ALTER TABLE expenses ADD COLUMN occurred_at DATETIME');
  }
  db.exec("UPDATE expenses SET occurred_at = COALESCE(created_at, datetime('now')) WHERE occurred_at IS NULL");
  db.exec('UPDATE expenses SET amount = ROUND(amount)');
  db.exec('UPDATE expense_splits SET amount_owed = ROUND(amount_owed)');
  db.exec('UPDATE settlements SET amount = ROUND(amount)');
  const reconcileSplits = db.transaction(() => {
    const expenses = db.prepare('SELECT id, CAST(ROUND(amount) AS INTEGER) AS amount FROM expenses').all();
    const listSplits = db.prepare('SELECT id, CAST(ROUND(amount_owed) AS INTEGER) AS amount_owed FROM expense_splits WHERE expense_id = ? ORDER BY id ASC');
    const updateSplit = db.prepare('UPDATE expense_splits SET amount_owed = ? WHERE id = ?');
    const updateExpense = db.prepare('UPDATE expenses SET amount = ? WHERE id = ?');

    for (const expense of expenses) {
      const splits = listSplits.all(expense.id);
      if (!splits.length) {
        continue;
      }

      for (const split of splits) {
        split.amount_owed = Math.max(1, split.amount_owed);
      }

      let targetAmount = expense.amount;
      const minimumSplitTotal = splits.length;
      if (targetAmount < minimumSplitTotal) {
        targetAmount = minimumSplitTotal;
        updateExpense.run(targetAmount, expense.id);
      }

      let diff = targetAmount - splits.reduce((sum, split) => sum + split.amount_owed, 0);
      if (diff === 0) {
        for (const split of splits) {
          updateSplit.run(split.amount_owed, split.id);
        }
        continue;
      }

      while (diff !== 0) {
        let changed = false;
        for (const split of splits) {
          if (diff > 0) {
            split.amount_owed += 1;
            diff -= 1;
            changed = true;
          } else if (split.amount_owed > 1) {
            split.amount_owed -= 1;
            diff += 1;
            changed = true;
          }

          if (diff === 0) {
            break;
          }
        }

        if (!changed) {
          splits[0].amount_owed += diff;
          diff = 0;
        }
      }

      for (const split of splits) {
        updateSplit.run(split.amount_owed, split.id);
      }
    }
  });
  reconcileSplits();

  const passkeyColumns = db.prepare('PRAGMA table_info(passkeys)').all();
  if (!passkeyColumns.some((column) => column.name === 'name')) {
    db.exec('ALTER TABLE passkeys ADD COLUMN name TEXT');
  }

  const categories = [
    { name: 'Övrigt', icon: 'shapes', sort_order: 0 },
    { name: 'Bilresa', icon: 'car', sort_order: 1 },
    { name: 'Mat', icon: 'utensils-crossed', sort_order: 2 },
    { name: 'Dryck', icon: 'wine', sort_order: 3 },
    { name: 'Boende', icon: 'house', sort_order: 4 },
  ];

  const insertCategory = db.prepare(`
    INSERT OR IGNORE INTO expense_categories (name, icon, sort_order)
    VALUES (?, ?, ?)
  `);
  for (const category of categories) {
    insertCategory.run(category.name, category.icon, category.sort_order);
  }

  const categoryRows = db.prepare('SELECT id FROM expense_categories ORDER BY sort_order ASC, id ASC').all();
  const uncategorizedExpenses = db.prepare('SELECT id FROM expenses WHERE category_id IS NULL').all();
  if (categoryRows.length && uncategorizedExpenses.length) {
    const updateCategory = db.prepare('UPDATE expenses SET category_id = ? WHERE id = ?');
    const tx = db.transaction(() => {
      for (const expense of uncategorizedExpenses) {
        const randomCategory = categoryRows[Math.floor(Math.random() * categoryRows.length)];
        updateCategory.run(randomCategory.id, expense.id);
      }
    });
    tx();
  }

  ensureRegistrationAccessToken();
}
