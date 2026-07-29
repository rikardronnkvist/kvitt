import express from 'express';
import { z } from 'zod';
import authMiddleware from '../middleware/auth.js';
import { db } from '../db/database.js';
import { calculateMemberBalances } from '../utils/balance.js';

const router = express.Router();
router.use(authMiddleware);

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

const addMemberSchema = z.object({
  user_id: z.number().int().positive(),
});

const searchMembersSchema = z.object({
  query: z.string().trim().min(1).max(100),
});

function getMembership(groupId, userId) {
  return db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
}

function requireMembership(req, res, next) {
  const { id } = req.params;
  const membership = getMembership(Number(id), req.user.id);
  if (!membership) {
    return res.status(403).json({ error: 'Du har inte åtkomst till den här gruppen.' });
  }
  return next();
}

router.get('/', (req, res) => {
  const groups = db.prepare(`
    SELECT g.id, g.name, g.created_at,
           COUNT(gm2.user_id) AS member_count
    FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    LEFT JOIN group_members gm2 ON gm2.group_id = g.id
    WHERE gm.user_id = ?
    GROUP BY g.id
    ORDER BY g.created_at DESC
  `).all(req.user.id);

  return res.json(groups.map((group) => {
    const currentMember = calculateMemberBalances(group.id).find((member) => Number(member.id) === Number(req.user.id));

    return {
      ...group,
      member_count: Number(group.member_count),
      current_user_balance: Number(currentMember?.balance || 0),
    };
  }));
});

router.post('/', (req, res) => {
  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltigt gruppnamn.', details: parsed.error.flatten() });
  }

  const tx = db.transaction(() => {
    const result = db.prepare('INSERT INTO groups (name, created_by) VALUES (?, ?)').run(parsed.data.name, req.user.id);
    db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(result.lastInsertRowid, req.user.id);
    return result.lastInsertRowid;
  });

  const groupId = tx();
  const group = db.prepare('SELECT id, name, created_by, created_at FROM groups WHERE id = ?').get(groupId);
  return res.status(201).json(group);
});

router.get('/:id', requireMembership, (req, res) => {
  const groupId = Number(req.params.id);
  const group = db.prepare(`
    SELECT g.id, g.name, g.created_by, g.created_at,
           u.full_name AS created_by_full_name,
           u.email AS created_by_email
    FROM groups g
    JOIN users u ON u.id = g.created_by
    WHERE g.id = ?
  `).get(groupId);

  if (!group) {
    return res.status(404).json({ error: 'Gruppen hittades inte.' });
  }

  const members = db.prepare(`
    SELECT u.id, u.email, u.full_name, gm.joined_at
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY COALESCE(NULLIF(TRIM(u.full_name), ''), u.email) COLLATE NOCASE
  `).all(groupId);

  return res.json({ ...group, members });
});

router.get('/:id/member-search', requireMembership, (req, res) => {
  const parsed = searchMembersSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig sökfråga.', details: parsed.error.flatten() });
  }

  const groupId = Number(req.params.id);
  const searchTerm = parsed.data.query.toLowerCase();
  const pattern = `%${searchTerm}%`;
  const candidates = db.prepare(`
    SELECT u.id, u.email, u.full_name
    FROM users u
    WHERE u.id NOT IN (
      SELECT gm.user_id
      FROM group_members gm
      WHERE gm.group_id = ?
    )
      AND (
        LOWER(COALESCE(u.full_name, '')) LIKE ?
        OR LOWER(u.email) LIKE ?
      )
    ORDER BY
      CASE
        WHEN LOWER(u.email) = ? THEN 0
        WHEN LOWER(COALESCE(u.full_name, '')) = ? THEN 1
        WHEN LOWER(u.email) LIKE ? THEN 2
        ELSE 3
      END,
      COALESCE(NULLIF(TRIM(u.full_name), ''), u.email) COLLATE NOCASE
    LIMIT 10
  `).all(groupId, pattern, pattern, searchTerm, searchTerm, `${searchTerm}%`);

  return res.json(candidates);
});

router.post('/:id/members', requireMembership, (req, res) => {
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig användare.', details: parsed.error.flatten() });
  }

  const groupId = Number(req.params.id);
  const user = db.prepare('SELECT id, email, full_name FROM users WHERE id = ?').get(parsed.data.user_id);
  if (!user) {
    return res.status(404).json({ error: 'Användaren hittades inte.' });
  }

  const existingMembership = getMembership(groupId, user.id);
  if (existingMembership) {
    return res.status(409).json({ error: 'Användaren är redan medlem i gruppen.' });
  }

  db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, user.id);
  return res.status(201).json(user);
});

router.delete('/:id/members/:userId', requireMembership, (req, res) => {
  const groupId = Number(req.params.id);
  const userId = Number(req.params.userId);
  const existingMembership = getMembership(groupId, userId);

  if (!existingMembership) {
    return res.status(404).json({ error: 'Medlemskapet hittades inte.' });
  }

  const memberCount = db.prepare('SELECT COUNT(*) AS count FROM group_members WHERE group_id = ?').get(groupId);
  if (Number(memberCount.count) === 1) {
    return res.status(400).json({ error: 'Den sista medlemmen kan inte tas bort.' });
  }

  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
  return res.status(204).send();
});

export default router;
