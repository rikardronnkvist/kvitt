import express from 'express';
import { z } from 'zod';
import authMiddleware from '../middleware/auth.js';
import { db } from '../db/database.js';

const router = express.Router();

function getValidInvite(token) {
  return db.prepare(`
    SELECT gi.id, gi.group_id, gi.expires_at,
           g.name AS group_name, g.slug AS group_slug, g.theme_color
    FROM group_invites gi
    JOIN groups g ON g.id = gi.group_id
    WHERE gi.token = ? AND datetime(gi.expires_at) > datetime('now')
  `).get(token);
}

// Public: get group info + unclaimed placeholders for an invite link
router.get('/:token', (req, res) => {
  const invite = getValidInvite(req.params.token);
  if (!invite) {
    return res.status(410).json({ error: 'Inbjudningslänken har gått ut eller är ogiltig.' });
  }

  const placeholders = db.prepare(`
    SELECT u.id, u.full_name
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ? AND u.is_placeholder = 1
    ORDER BY COALESCE(NULLIF(TRIM(u.full_name), ''), CAST(u.id AS TEXT)) COLLATE NOCASE
  `).all(invite.group_id);

  return res.json({
    group: {
      name: invite.group_name,
      slug: invite.group_slug,
      theme_color: invite.theme_color,
    },
    placeholders,
  });
});

const acceptSchema = z.object({
  placeholder_id: z.number().int().positive().optional(),
});

function getMatchingPlaceholderId(groupId, fullName) {
  const normalizedName = String(fullName || '').trim().toLocaleLowerCase();
  if (!normalizedName) {
    return null;
  }

  const matches = db.prepare(`
    SELECT u.id, u.full_name
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
      AND u.is_placeholder = 1
  `).all(groupId).filter((placeholder) => (
    String(placeholder.full_name || '').trim().toLocaleLowerCase() === normalizedName
  ));

  return matches.length === 1 ? Number(matches[0].id) : null;
}

// Authenticated: join group via invite, optionally claiming a placeholder identity
router.post('/:token/accept', authMiddleware, (req, res) => {
  const invite = getValidInvite(req.params.token);
  if (!invite) {
    return res.status(410).json({ error: 'Inbjudningslänken har gått ut eller är ogiltig.' });
  }

  const parsed = acceptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig data.', details: parsed.error.flatten() });
  }

  const groupId = invite.group_id;
  const realUserId = req.user.id;

  const placeholderId = parsed.data.placeholder_id || getMatchingPlaceholderId(groupId, req.user.full_name);
  const alreadyMember = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
  ).get(groupId, realUserId);

  if (alreadyMember && !placeholderId) {
    return res.json({ slug: invite.group_slug, already_member: true });
  }

  const tx = db.transaction(() => {
    if (placeholderId) {
      const placeholder = db.prepare(`
        SELECT u.id FROM users u
        JOIN group_members gm ON gm.user_id = u.id
        WHERE u.id = ? AND u.is_placeholder = 1 AND gm.group_id = ?
      `).get(placeholderId, groupId);

      if (!placeholder) {
        throw Object.assign(new Error('Platshållaren hittades inte i den här gruppen.'), { status: 404 });
      }

      // Reassign all references from placeholder to real user
      db.prepare('UPDATE expense_splits SET user_id = ? WHERE user_id = ?').run(realUserId, placeholderId);
      db.prepare('UPDATE expenses SET paid_by_user_id = ? WHERE paid_by_user_id = ?').run(realUserId, placeholderId);
      db.prepare('UPDATE settlements SET payer_id = ? WHERE payer_id = ?').run(realUserId, placeholderId);
      db.prepare('UPDATE settlements SET receiver_id = ? WHERE receiver_id = ?').run(realUserId, placeholderId);
      db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, placeholderId);
      db.prepare('DELETE FROM users WHERE id = ?').run(placeholderId);
    }

    if (!alreadyMember) {
      db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, realUserId);
    }
  });

  try {
    tx();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  return res.json({ slug: invite.group_slug, already_member: alreadyMember ? true : false });
});

export default router;
