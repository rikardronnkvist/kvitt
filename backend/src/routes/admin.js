import express from 'express';
import { z } from 'zod';
import authMiddleware from '../middleware/auth.js';
import { db } from '../db/database.js';
import {
  getRegistrationAccessToken,
  resetRegistrationAccessToken,
  setRegistrationAccessToken,
} from '../utils/settings.js';
import { getFrontendPublicOrigin } from '../utils/public-origin.js';
import { createUniqueSlug, slugifyGroupName } from '../utils/slug.js';
import { resolveRequestIp, tryLogActivity } from '../utils/activity-log.js';

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
  is_admin: z.boolean(),
  full_name: z.string().trim().min(1).max(100),
});

const updateGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  theme_color: z.string().trim().min(1).max(50).optional().nullable(),
  mileage_rate: z.number().positive().max(1000).optional(),
});

const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  icon: z.string().trim().min(1).max(50),
  sort_order: z.number().int().min(0).optional(),
});

const updateRegistrationTokenSchema = z.object({
  token: z.string().trim().min(16).max(200),
});

const activityLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  event_type: z.string().trim().min(1).max(120).optional(),
  actor_user_id: z.coerce.number().int().positive().optional(),
  group_id: z.coerce.number().int().positive().optional(),
  query: z.string().trim().min(1).max(120).optional(),
});

function buildRegistrationUrl(token) {
  return `${getFrontendPublicOrigin()}/register?${encodeURIComponent(token)}`;
}

function normalizeDateFilter(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

router.get('/activity-logs', (req, res) => {
  const parsed = activityLogsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltiga filterparametrar.', details: parsed.error.flatten() });
  }

  const {
    page,
    pageSize,
    from,
    to,
    event_type,
    actor_user_id,
    group_id,
    query,
  } = parsed.data;

  const fromIso = normalizeDateFilter(from);
  const toIso = normalizeDateFilter(to);
  if (from && !fromIso) {
    return res.status(400).json({ error: 'Ogiltigt from-datum.' });
  }
  if (to && !toIso) {
    return res.status(400).json({ error: 'Ogiltigt to-datum.' });
  }

  const where = [];
  const params = [];

  if (event_type) {
    where.push('al.event_type = ?');
    params.push(event_type);
  }
  if (actor_user_id) {
    where.push('al.actor_user_id = ?');
    params.push(actor_user_id);
  }
  if (group_id) {
    where.push('al.group_id = ?');
    params.push(group_id);
  }
  if (fromIso) {
    where.push('datetime(al.created_at) >= datetime(?)');
    params.push(fromIso);
  }
  if (toIso) {
    where.push('datetime(al.created_at) <= datetime(?)');
    params.push(toIso);
  }
  if (query) {
    where.push(`(
      LOWER(al.event_type) LIKE ?
      OR LOWER(al.action) LIKE ?
      OR LOWER(al.entity_type) LIKE ?
      OR LOWER(COALESCE(actor.full_name, '')) LIKE ?
      OR LOWER(COALESCE(target.full_name, '')) LIKE ?
      OR LOWER(COALESCE(g.name, '')) LIKE ?
      OR LOWER(COALESCE(al.metadata_json, '')) LIKE ?
    )`);
    const pattern = `%${query.toLowerCase()}%`;
    params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const totalRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM activity_logs al
    LEFT JOIN users actor ON actor.id = al.actor_user_id
    LEFT JOIN users target ON target.id = al.target_user_id
    LEFT JOIN groups g ON g.id = al.group_id
    ${whereSql}
  `).get(...params);

  const rows = db.prepare(`
    SELECT
      al.id,
      al.event_type,
      al.action,
      al.actor_user_id,
      al.target_user_id,
      al.group_id,
      al.entity_type,
      al.entity_id,
      al.metadata_json,
      al.ip_address,
      al.created_at,
      actor.full_name AS actor_full_name,
      target.full_name AS target_full_name,
      g.name AS group_name
    FROM activity_logs al
    LEFT JOIN users actor ON actor.id = al.actor_user_id
    LEFT JOIN users target ON target.id = al.target_user_id
    LEFT JOIN groups g ON g.id = al.group_id
    ${whereSql}
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset).map((row) => {
    let metadata = null;
    if (row.metadata_json) {
      try {
        metadata = JSON.parse(row.metadata_json);
      } catch {
        metadata = null;
      }
    }

    return {
      ...row,
      metadata,
    };
  });

  return res.json({
    items: rows,
    total: Number(totalRow?.count || 0),
    page,
    pageSize,
    hasNextPage: Number(totalRow?.count || 0) > page * pageSize,
  });
});

router.get('/registration-access', (req, res) => {
  const token = getRegistrationAccessToken();
  return res.json({
    token,
    registration_url: buildRegistrationUrl(token),
  });
});

router.put('/registration-access', (req, res) => {
  const parsed = updateRegistrationTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig registreringsnyckel.', details: parsed.error.flatten() });
  }

  const previousToken = getRegistrationAccessToken();
  setRegistrationAccessToken(parsed.data.token);
  tryLogActivity({
    eventType: 'admin.registration_access.updated',
    action: 'update',
    actorUserId: req.user.id,
    entityType: 'registration_access',
    metadata: {
      had_previous_token: Boolean(previousToken),
      previous_token_length: previousToken?.length || 0,
      next_token_length: parsed.data.token.length,
    },
    ipAddress: resolveRequestIp(req),
  });

  return res.json({
    token: parsed.data.token,
    registration_url: buildRegistrationUrl(parsed.data.token),
  });
});

router.post('/registration-access/reset', (req, res) => {
  const token = resetRegistrationAccessToken();
  tryLogActivity({
    eventType: 'admin.registration_access.reset',
    action: 'reset',
    actorUserId: req.user.id,
    entityType: 'registration_access',
    metadata: {
      token_length: token.length,
    },
    ipAddress: resolveRequestIp(req),
  });

  return res.json({
    token,
    registration_url: buildRegistrationUrl(token),
  });
});

router.get('/users', (_req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.is_admin, u.full_name, u.created_at,
           COUNT(DISTINCT gm.group_id) AS group_count,
           COUNT(DISTINCT p.id) AS passkey_count
    FROM users u
    LEFT JOIN group_members gm ON gm.user_id = u.id
    LEFT JOIN passkeys p ON p.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `).all();

  return res.json(users.map((user) => ({
    ...user,
    is_admin: Boolean(user.is_admin),
    group_count: Number(user.group_count),
    passkey_count: Number(user.passkey_count),
  })));
});

router.delete('/users/:id', (req, res) => {
  const userId = Number(req.params.id);

  if (req.user.id === userId) {
    return res.status(400).json({ error: 'Du kan inte radera ditt eget konto.' });
  }

  const user = db.prepare(`
    SELECT u.id, u.is_admin, u.full_name, COUNT(gm.group_id) AS group_count
    FROM users u
    LEFT JOIN group_members gm ON gm.user_id = u.id
    WHERE u.id = ?
    GROUP BY u.id
  `).get(userId);

  if (!user) {
    return res.status(404).json({ error: 'Användaren hittades inte.' });
  }

  if (Number(user.group_count) > 0) {
    return res.status(400).json({ error: 'Kan inte radera en användare som är med i grupper.' });
  }

  db.prepare('DELETE FROM passkeys WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);

  tryLogActivity({
    eventType: 'admin.user.deleted',
    action: 'delete',
    actorUserId: req.user.id,
    targetUserId: userId,
    entityType: 'user',
    entityId: userId,
    metadata: {
      deleted_user_full_name: user.full_name || null,
      was_admin: Boolean(user.is_admin),
    },
    ipAddress: resolveRequestIp(req),
  });

  return res.status(204).end();
});

router.put('/users/:id', (req, res) => {
  const userId = Number(req.params.id);
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig användardata.', details: parsed.error.flatten() });
  }

  const existingUser = db.prepare('SELECT id, is_admin, full_name FROM users WHERE id = ?').get(userId);
  if (!existingUser) {
    return res.status(404).json({ error: 'Användaren hittades inte.' });
  }

  if (existingUser.is_admin && !parsed.data.is_admin) {
    const adminCount = db.prepare('SELECT COUNT(*) AS count FROM users WHERE is_admin = 1').get();
    if (Number(adminCount.count) <= 1) {
      return res.status(400).json({ error: 'Det måste finnas minst en administratör.' });
    }
  }

  db.prepare(
    'UPDATE users SET is_admin = ?, full_name = ? WHERE id = ?',
  ).run(parsed.data.is_admin ? 1 : 0, parsed.data.full_name, userId);

  tryLogActivity({
    eventType: 'admin.user.updated',
    action: 'update',
    actorUserId: req.user.id,
    targetUserId: userId,
    entityType: 'user',
    entityId: userId,
    metadata: {
      before: {
        is_admin: Boolean(existingUser.is_admin),
        full_name: existingUser.full_name,
      },
      after: {
        is_admin: Boolean(parsed.data.is_admin),
        full_name: parsed.data.full_name,
      },
    },
    ipAddress: resolveRequestIp(req),
  });

  const updated = db.prepare(`
    SELECT u.id, u.is_admin, u.full_name, u.created_at,
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
    SELECT g.id, g.name, g.theme_color, g.mileage_rate, g.created_at, g.created_by, g.archived_at,
           u.full_name AS created_by_full_name,
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

  const group = db.prepare('SELECT id, name, theme_color, mileage_rate, archived_at FROM groups WHERE id = ?').get(groupId);
  if (!group) {
    return res.status(404).json({ error: 'Gruppen hittades inte.' });
  }
  if (group.archived_at) {
    return res.status(409).json({ error: 'Gruppen är arkiverad och skrivskyddad.' });
  }

  if (parsed.data.name !== group.name) {
    const baseSlug = slugifyGroupName(parsed.data.name);
    const slug = createUniqueSlug(
      baseSlug,
      (candidate) => Boolean(db.prepare('SELECT 1 FROM groups WHERE slug = ? AND id != ?').get(candidate, groupId)),
    );
    db.prepare('UPDATE groups SET name = ?, slug = ?, theme_color = ? WHERE id = ?').run(
      parsed.data.name,
      slug,
      parsed.data.theme_color ?? null,
      groupId
    );
  } else {
    db.prepare('UPDATE groups SET name = ?, theme_color = ? WHERE id = ?').run(
      parsed.data.name,
      parsed.data.theme_color ?? null,
      groupId
    );
  }
  if (parsed.data.mileage_rate !== undefined) {
    db.prepare('UPDATE groups SET mileage_rate = ? WHERE id = ?').run(parsed.data.mileage_rate, groupId);
  }

  tryLogActivity({
    eventType: 'admin.group.updated',
    action: 'update',
    actorUserId: req.user.id,
    groupId,
    entityType: 'group',
    entityId: groupId,
    metadata: {
      before: {
        name: group.name,
        theme_color: group.theme_color,
        mileage_rate: group.mileage_rate,
      },
      after: {
        name: parsed.data.name,
        theme_color: parsed.data.theme_color ?? null,
        mileage_rate: parsed.data.mileage_rate ?? group.mileage_rate,
      },
    },
    ipAddress: resolveRequestIp(req),
  });

  const updated = db.prepare(`
    SELECT g.id, g.name, g.theme_color, g.mileage_rate, g.created_at, g.created_by, g.archived_at,
           u.full_name AS created_by_full_name,
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

router.get('/categories', (_req, res) => {
  const categories = db.prepare(`
    SELECT id, name, icon, sort_order, created_at
    FROM expense_categories
    ORDER BY sort_order ASC, id ASC
  `).all();
  return res.json(categories);
});

router.put('/categories/:id', (req, res) => {
  const categoryId = Number(req.params.id);
  const parsed = updateCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig kategoridata.', details: parsed.error.flatten() });
  }

  const existing = db.prepare('SELECT id, name, icon, sort_order FROM expense_categories WHERE id = ?').get(categoryId);
  if (!existing) {
    return res.status(404).json({ error: 'Kategorin hittades inte.' });
  }

  try {
    db.prepare(`
      UPDATE expense_categories
      SET name = ?, icon = ?, sort_order = COALESCE(?, sort_order)
      WHERE id = ?
    `).run(parsed.data.name, parsed.data.icon, parsed.data.sort_order ?? null, categoryId);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Kategorinamnet används redan.' });
    }
    throw error;
  }

  const updated = db.prepare(`
    SELECT id, name, icon, sort_order, created_at
    FROM expense_categories
    WHERE id = ?
  `).get(categoryId);

  tryLogActivity({
    eventType: 'admin.category.updated',
    action: 'update',
    actorUserId: req.user.id,
    entityType: 'expense_category',
    entityId: categoryId,
    metadata: {
      before: {
        name: existing.name,
        icon: existing.icon,
        sort_order: existing.sort_order,
      },
      after: {
        name: updated.name,
        icon: updated.icon,
        sort_order: updated.sort_order,
      },
    },
    ipAddress: resolveRequestIp(req),
  });

  return res.json(updated);
});

export default router;
