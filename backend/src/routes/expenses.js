import express from 'express';
import { z } from 'zod';
import authMiddleware from '../middleware/auth.js';
import { db } from '../db/database.js';

const router = express.Router();
router.use(authMiddleware);

const splitSchema = z.object({
  user_id: z.number().int().positive(),
  amount_owed: z.number().positive(),
});

const expenseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  amount: z.number().positive(),
  currency: z.string().trim().min(1).max(10).default('SEK'),
  paid_by_user_id: z.number().int().positive(),
  notes: z.string().trim().max(1000).optional().nullable(),
  splits: z.array(splitSchema).optional(),
});

function requireMembership(groupId, userId) {
  return db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
}

function parseExpenseRows(rows) {
  const expenses = new Map();
  for (const row of rows) {
    if (!expenses.has(row.id)) {
      expenses.set(row.id, {
        id: row.id,
        group_id: row.group_id,
        title: row.title,
        amount: Number(row.amount),
        currency: row.currency,
        paid_by_user_id: row.paid_by_user_id,
        paid_by_full_name: row.paid_by_full_name,
        paid_by_email: row.paid_by_email,
        paid_by_initials: row.paid_by_initials || null,
        notes: row.notes,
        created_at: row.created_at,
        splits: [],
      });
    }
    if (row.split_id) {
      expenses.get(row.id).splits.push({
        id: row.split_id,
        user_id: row.split_user_id,
        full_name: row.split_full_name,
        email: row.split_email,
        initials: row.split_initials || null,
        amount_owed: Number(row.amount_owed),
      });
    }
  }
  return Array.from(expenses.values());
}

router.get('/:groupId/export', (req, res) => {
  const groupId = Number(req.params.groupId);
  if (!requireMembership(groupId, req.user.id)) {
    return res.status(403).json({ error: 'Du har inte åtkomst till den här gruppen.' });
  }

  const rows = db.prepare(`
    SELECT e.id, e.title, e.amount, e.currency, e.notes, e.created_at,
           COALESCE(NULLIF(TRIM(payer.full_name), ''), payer.email) AS paid_by_display_name,
           GROUP_CONCAT(COALESCE(NULLIF(TRIM(split_user.full_name), ''), split_user.email) || ':' || printf('%.2f', es.amount_owed), '; ') AS split_summary
    FROM expenses e
    JOIN users payer ON payer.id = e.paid_by_user_id
    LEFT JOIN expense_splits es ON es.expense_id = e.id
    LEFT JOIN users split_user ON split_user.id = es.user_id
    WHERE e.group_id = ?
    GROUP BY e.id
    ORDER BY e.created_at DESC
  `).all(groupId);

  const headers = ['id', 'titel', 'belopp', 'valuta', 'betald_av', 'anteckningar', 'splits', 'skapad'];
  const escape = (value) => {
    const text = value == null ? '' : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = [headers.join(',')]
    .concat(rows.map((row) => [
      row.id,
      row.title,
      Number(row.amount).toFixed(2),
      row.currency,
      row.paid_by_display_name,
      row.notes || '',
      row.split_summary || '',
      row.created_at,
    ].map(escape).join(',')))
    .join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="kvitt-group-${groupId}-expenses.csv"`);
  return res.send(csv);
});

router.get('/:groupId', (req, res) => {
  const groupId = Number(req.params.groupId);
  if (!requireMembership(groupId, req.user.id)) {
    return res.status(403).json({ error: 'Du har inte åtkomst till den här gruppen.' });
  }

  const rows = db.prepare(`
    SELECT e.id, e.group_id, e.title, e.amount, e.currency, e.paid_by_user_id, e.notes, e.created_at,
           payer.full_name AS paid_by_full_name,
           payer.email AS paid_by_email,
           payer.initials AS paid_by_initials,
           es.id AS split_id, es.user_id AS split_user_id, es.amount_owed,
           split_user.full_name AS split_full_name,
           split_user.email AS split_email,
           split_user.initials AS split_initials
    FROM expenses e
    JOIN users payer ON payer.id = e.paid_by_user_id
    LEFT JOIN expense_splits es ON es.expense_id = e.id
    LEFT JOIN users split_user ON split_user.id = es.user_id
    WHERE e.group_id = ?
    ORDER BY e.created_at DESC, es.id ASC
  `).all(groupId);

  return res.json(parseExpenseRows(rows));
});

router.post('/:groupId', (req, res) => {
  const groupId = Number(req.params.groupId);
  if (!requireMembership(groupId, req.user.id)) {
    return res.status(403).json({ error: 'Du har inte åtkomst till den här gruppen.' });
  }

  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig utgiftsdata.', details: parsed.error.flatten() });
  }

  const groupMembers = db.prepare(`
    SELECT u.id, u.full_name, u.email
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY u.id ASC
  `).all(groupId);

  if (!groupMembers.length) {
    return res.status(400).json({ error: 'Gruppen saknar medlemmar.' });
  }

  const memberIds = new Set(groupMembers.map((member) => member.id));
  const { title, amount, currency, paid_by_user_id, notes } = parsed.data;

  if (!memberIds.has(paid_by_user_id)) {
    return res.status(400).json({ error: 'Betalaren måste vara medlem i gruppen.' });
  }

  let splits = parsed.data.splits;
  if (!splits || splits.length === 0) {
    const base = Math.floor((amount / groupMembers.length) * 100) / 100;
    let remainder = Math.round((amount - base * groupMembers.length) * 100);
    splits = groupMembers.map((member) => {
      const extra = remainder > 0 ? 0.01 : 0;
      remainder -= extra > 0 ? 1 : 0;
      return {
        user_id: member.id,
        amount_owed: Math.round((base + extra) * 100) / 100,
      };
    });
  }

  const invalidSplit = splits.find((split) => !memberIds.has(split.user_id));
  if (invalidSplit) {
    return res.status(400).json({ error: 'Alla splits måste tillhöra gruppmedlemmar.' });
  }

  const splitTotal = Math.round(splits.reduce((sum, split) => sum + Number(split.amount_owed), 0) * 100) / 100;
  const roundedAmount = Math.round(amount * 100) / 100;
  if (Math.abs(splitTotal - roundedAmount) > 0.01) {
    return res.status(400).json({ error: 'Summan av splits måste motsvara utgiftens belopp.' });
  }

  const tx = db.transaction(() => {
    const expenseResult = db.prepare(`
      INSERT INTO expenses (group_id, title, amount, currency, paid_by_user_id, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(groupId, title, amount, currency, paid_by_user_id, notes || null);

    const insertSplit = db.prepare(
      'INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES (?, ?, ?)',
    );

    for (const split of splits) {
      insertSplit.run(expenseResult.lastInsertRowid, split.user_id, split.amount_owed);
    }

    return expenseResult.lastInsertRowid;
  });

  const expenseId = tx();
  const rows = db.prepare(`
    SELECT e.id, e.group_id, e.title, e.amount, e.currency, e.paid_by_user_id, e.notes, e.created_at,
           payer.full_name AS paid_by_full_name,
           payer.email AS paid_by_email,
           payer.initials AS paid_by_initials,
           es.id AS split_id, es.user_id AS split_user_id, es.amount_owed,
           split_user.full_name AS split_full_name,
           split_user.email AS split_email,
           split_user.initials AS split_initials
    FROM expenses e
    JOIN users payer ON payer.id = e.paid_by_user_id
    LEFT JOIN expense_splits es ON es.expense_id = e.id
    LEFT JOIN users split_user ON split_user.id = es.user_id
    WHERE e.id = ?
    ORDER BY es.id ASC
  `).all(expenseId);

  return res.status(201).json(parseExpenseRows(rows)[0]);
});

router.put('/:groupId/:expenseId', (req, res) => {
  const groupId = Number(req.params.groupId);
  const expenseId = Number(req.params.expenseId);
  if (!requireMembership(groupId, req.user.id)) {
    return res.status(403).json({ error: 'Du har inte åtkomst till den här gruppen.' });
  }

  const expense = db.prepare('SELECT id, group_id FROM expenses WHERE id = ? AND group_id = ?').get(expenseId, groupId);
  if (!expense) {
    return res.status(404).json({ error: 'Utgiften hittades inte.' });
  }

  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig utgiftsdata.', details: parsed.error.flatten() });
  }

  const groupMembers = db.prepare(`
    SELECT u.id, u.full_name, u.email
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY u.id ASC
  `).all(groupId);

  const memberIds = new Set(groupMembers.map((member) => member.id));
  const { title, amount, currency, paid_by_user_id, notes } = parsed.data;

  if (!memberIds.has(paid_by_user_id)) {
    return res.status(400).json({ error: 'Betalaren måste vara medlem i gruppen.' });
  }

  let splits = parsed.data.splits;
  if (!splits || splits.length === 0) {
    const base = Math.floor((amount / groupMembers.length) * 100) / 100;
    let remainder = Math.round((amount - base * groupMembers.length) * 100);
    splits = groupMembers.map((member) => {
      const extra = remainder > 0 ? 0.01 : 0;
      remainder -= extra > 0 ? 1 : 0;
      return {
        user_id: member.id,
        amount_owed: Math.round((base + extra) * 100) / 100,
      };
    });
  }

  const invalidSplit = splits.find((split) => !memberIds.has(split.user_id));
  if (invalidSplit) {
    return res.status(400).json({ error: 'Alla splits måste tillhöra gruppmedlemmar.' });
  }

  const splitTotal = Math.round(splits.reduce((sum, split) => sum + Number(split.amount_owed), 0) * 100) / 100;
  const roundedAmount = Math.round(amount * 100) / 100;
  if (Math.abs(splitTotal - roundedAmount) > 0.01) {
    return res.status(400).json({ error: 'Summan av splits måste motsvara utgiftens belopp.' });
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE expenses SET title = ?, amount = ?, currency = ?, paid_by_user_id = ?, notes = ? WHERE id = ?')
      .run(title, amount, currency, paid_by_user_id, notes || null, expenseId);

    db.prepare('DELETE FROM expense_splits WHERE expense_id = ?').run(expenseId);

    const insertSplit = db.prepare(
      'INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES (?, ?, ?)',
    );

    for (const split of splits) {
      insertSplit.run(expenseId, split.user_id, split.amount_owed);
    }
  });

  tx();
  const rows = db.prepare(`
    SELECT e.id, e.group_id, e.title, e.amount, e.currency, e.paid_by_user_id, e.notes, e.created_at,
           payer.full_name AS paid_by_full_name,
           payer.email AS paid_by_email,
           payer.initials AS paid_by_initials,
           es.id AS split_id, es.user_id AS split_user_id, es.amount_owed,
           split_user.full_name AS split_full_name,
           split_user.email AS split_email,
           split_user.initials AS split_initials
    FROM expenses e
    JOIN users payer ON payer.id = e.paid_by_user_id
    LEFT JOIN expense_splits es ON es.expense_id = e.id
    LEFT JOIN users split_user ON split_user.id = es.user_id
    WHERE e.id = ?
    ORDER BY es.id ASC
  `).all(expenseId);

  return res.json(parseExpenseRows(rows)[0]);
});

router.delete('/:groupId/:expenseId', (req, res) => {
  const groupId = Number(req.params.groupId);
  const expenseId = Number(req.params.expenseId);
  if (!requireMembership(groupId, req.user.id)) {
    return res.status(403).json({ error: 'Du har inte åtkomst till den här gruppen.' });
  }

  const expense = db.prepare('SELECT id FROM expenses WHERE id = ? AND group_id = ?').get(expenseId, groupId);
  if (!expense) {
    return res.status(404).json({ error: 'Utgiften hittades inte.' });
  }

  db.prepare('DELETE FROM expenses WHERE id = ?').run(expenseId);
  return res.status(204).send();
});

export default router;
