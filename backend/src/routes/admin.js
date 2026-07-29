import express from 'express';
import { z } from 'zod';
import authMiddleware from '../middleware/auth.js';
import { db } from '../db/database.js';

const router = express.Router();
router.use(authMiddleware);

function requireAdmin(req, res, next) {
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id);
  if (!user || !Boolean(user.is_admin)) {
    return res.status(403).json({ error: 'Endast administratörer har åtkomst.' });
  }
  return next();
}

router.use(requireAdmin);

const updateUserSchema = z.object({
  username: z.string().trim().min(3).max(30),
  email: z.string().trim().email(),
  is_admin: z.boolean(),
});

const updateGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

router.get('/users', (_req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.is_admin, u.created_at,
           COUNT(gm.group_id) AS group_count
    FROM users u
    LEFT JOIN group_members gm ON gm.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `).all();

  return res.json(users.map((user) => ({
    ...user,
    is_admin: Boolean(user.is_admin),
    group_count: Number(user.group_count),
  })));
});

router.put('/users/:id', (req, res) => {
  const userId = Number(req.params.id);
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig användardata.', details: parsed.error.flatten() });
  }

  const existingUser = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(userId);
  if (!existingUser) {
    return res.status(404).json({ error: 'Användaren hittades inte.' });
  }

  if (existingUser.is_admin && !parsed.data.is_admin) {
    const adminCount = db.prepare('SELECT COUNT(*) AS count FROM users WHERE is_admin = 1').get();
    if (Number(adminCount.count) <= 1) {
      return res.status(400).json({ error: 'Det måste finnas minst en administratör.' });
    }
  }

  try {
    db.prepare(
      'UPDATE users SET username = ?, email = ?, is_admin = ? WHERE id = ?',
    ).run(parsed.data.username, parsed.data.email.toLowerCase(), parsed.data.is_admin ? 1 : 0, userId);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Användarnamn eller e-post används redan.' });
    }
    throw error;
  }

  const updated = db.prepare(`
    SELECT u.id, u.username, u.email, u.is_admin, u.created_at,
           COUNT(gm.group_id) AS group_count
    FROM users u
    LEFT JOIN group_members gm ON gm.user_id = u.id
    WHERE u.id = ?
    GROUP BY u.id
  `).get(userId);

  return res.json({
    ...updated,
    is_admin: Boolean(updated.is_admin),
    group_count: Number(updated.group_count),
  });
});

router.get('/groups', (_req, res) => {
  const groups = db.prepare(`
    SELECT g.id, g.name, g.created_at, g.created_by,
           u.username AS created_by_username,
           COUNT(gm.user_id) AS member_count
    FROM groups g
    JOIN users u ON u.id = g.created_by
    LEFT JOIN group_members gm ON gm.group_id = g.id
    GROUP BY g.id
    ORDER BY g.created_at DESC
  `).all();

  return res.json(groups.map((group) => ({
    ...group,
    member_count: Number(group.member_count),
  })));
});

router.put('/groups/:id', (req, res) => {
  const groupId = Number(req.params.id);
  const parsed = updateGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig gruppdata.', details: parsed.error.flatten() });
  }

  const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(groupId);
  if (!group) {
    return res.status(404).json({ error: 'Gruppen hittades inte.' });
  }

  db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(parsed.data.name, groupId);

  const updated = db.prepare(`
    SELECT g.id, g.name, g.created_at, g.created_by,
           u.username AS created_by_username,
           COUNT(gm.user_id) AS member_count
    FROM groups g
    JOIN users u ON u.id = g.created_by
    LEFT JOIN group_members gm ON gm.group_id = g.id
    WHERE g.id = ?
    GROUP BY g.id
  `).get(groupId);

  return res.json({
    ...updated,
    member_count: Number(updated.member_count),
  });
});

export default router;
