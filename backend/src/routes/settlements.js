import express from 'express';
import { z } from 'zod';
import authMiddleware from '../middleware/auth.js';
import { db } from '../db/database.js';
import { calculateBalances } from '../utils/balance.js';
import { logActivity, resolveRequestIp } from '../utils/activity-log.js';

const router = express.Router();
router.use(authMiddleware);

const settlementSchema = z.object({
  payer_id: z.number().int().positive(),
  receiver_id: z.number().int().positive(),
  amount: z.number().int().positive(),
  settled_at: z.string().trim().optional(),
});

function formatLocalDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function normalizeSettledAt(input) {
  if (!input) return null;
  const text = String(input).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0'] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  const parsed = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
    || parsed.getHours() !== hour
    || parsed.getMinutes() !== minute
    || parsed.getSeconds() !== second
  ) {
    return null;
  }

  return formatLocalDateTime(parsed);
}

function requireMembership(groupId, userId) {
  return db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
}

function isGroupArchived(groupId) {
  const group = db.prepare('SELECT archived_at FROM groups WHERE id = ?').get(groupId);
  return Boolean(group?.archived_at);
}

function getSettlementSnapshot(settlementId) {
  const settlement = db.prepare(`
    SELECT id, group_id, payer_id, receiver_id, amount, settled_at
    FROM settlements
    WHERE id = ?
  `).get(settlementId);

  if (!settlement) {
    return null;
  }

  return {
    id: settlement.id,
    group_id: settlement.group_id,
    payer_id: settlement.payer_id,
    receiver_id: settlement.receiver_id,
    amount: Math.round(Number(settlement.amount)),
    settled_at: settlement.settled_at,
  };
}

router.get('/:groupId', (req, res) => {
  const groupId = Number(req.params.groupId);
  if (!requireMembership(groupId, req.user.id)) {
    return res.status(403).json({ error: 'Du har inte åtkomst till den här gruppen.' });
  }

  const settlements = db.prepare(`
    SELECT s.id, s.group_id, s.payer_id, s.receiver_id, s.amount, s.settled_at,
           payer.full_name AS payer_full_name,
           receiver.full_name AS receiver_full_name
    FROM settlements s
    JOIN users payer ON payer.id = s.payer_id
    JOIN users receiver ON receiver.id = s.receiver_id
    WHERE s.group_id = ?
    ORDER BY s.settled_at DESC, s.id DESC
  `).all(groupId).map((settlement) => ({
    ...settlement,
    amount: Math.round(Number(settlement.amount)),
  }));

  return res.json(settlements);
});

router.post('/:groupId', (req, res) => {
  const groupId = Number(req.params.groupId);
  const ipAddress = resolveRequestIp(req);
  if (!requireMembership(groupId, req.user.id)) {
    return res.status(403).json({ error: 'Du har inte åtkomst till den här gruppen.' });
  }
  if (isGroupArchived(groupId)) {
    return res.status(409).json({ error: 'Gruppen är arkiverad och skrivskyddad.' });
  }

  const parsed = settlementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig betalningsdata.', details: parsed.error.flatten() });
  }

  const { payer_id, receiver_id, amount } = parsed.data;
  const settledAt = parsed.data.settled_at ? normalizeSettledAt(parsed.data.settled_at) : null;
  if (payer_id === receiver_id) {
    return res.status(400).json({ error: 'Betalare och mottagare måste vara olika personer.' });
  }
  if (parsed.data.settled_at && !settledAt) {
    return res.status(400).json({ error: 'Ogiltigt datum eller tid för betalningen.' });
  }

  const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId).map((row) => row.user_id);
  const memberIds = new Set(members);
  if (!memberIds.has(payer_id) || !memberIds.has(receiver_id)) {
    return res.status(400).json({ error: 'Båda användarna måste vara medlemmar i gruppen.' });
  }

  const result = db.transaction(() => {
    const insertResult = db.prepare(`
      INSERT INTO settlements (group_id, payer_id, receiver_id, amount, settled_at)
      VALUES (?, ?, ?, ?, COALESCE(?, datetime('now', 'localtime')))
    `).run(groupId, payer_id, receiver_id, amount, settledAt);

    logActivity({
      eventType: 'settlement.created',
      action: 'create',
      actorUserId: req.user.id,
      groupId,
      entityType: 'settlement',
      entityId: Number(insertResult.lastInsertRowid),
      metadata: {
        payer_id,
        receiver_id,
        amount,
        settled_at: settledAt,
      },
      ipAddress,
    });

    return insertResult;
  })();

  const settlement = db.prepare(`
    SELECT s.id, s.group_id, s.payer_id, s.receiver_id, s.amount, s.settled_at,
           payer.full_name AS payer_full_name,
           receiver.full_name AS receiver_full_name
    FROM settlements s
    JOIN users payer ON payer.id = s.payer_id
    JOIN users receiver ON receiver.id = s.receiver_id
    WHERE s.id = ?
  `).get(result.lastInsertRowid);

  return res.status(201).json({ ...settlement, amount: Math.round(Number(settlement.amount)) });
});

router.put('/:groupId/:settlementId', (req, res) => {
  const groupId = Number(req.params.groupId);
  const settlementId = Number(req.params.settlementId);
  const ipAddress = resolveRequestIp(req);

  if (!requireMembership(groupId, req.user.id)) {
    return res.status(403).json({ error: 'Du har inte åtkomst till den här gruppen.' });
  }
  if (isGroupArchived(groupId)) {
    return res.status(409).json({ error: 'Gruppen är arkiverad och skrivskyddad.' });
  }

  const parsed = settlementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Ogiltig betalningsdata.', details: parsed.error.flatten() });
  }

  const { payer_id, receiver_id, amount } = parsed.data;
  const settledAt = parsed.data.settled_at ? normalizeSettledAt(parsed.data.settled_at) : null;
  if (payer_id === receiver_id) {
    return res.status(400).json({ error: 'Betalare och mottagare måste vara olika personer.' });
  }
  if (parsed.data.settled_at && !settledAt) {
    return res.status(400).json({ error: 'Ogiltigt datum eller tid för betalningen.' });
  }

  const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId).map((row) => row.user_id);
  const memberIds = new Set(members);
  if (!memberIds.has(payer_id) || !memberIds.has(receiver_id)) {
    return res.status(400).json({ error: 'Båda användarna måste vara medlemmar i gruppen.' });
  }

  const existing = getSettlementSnapshot(settlementId);
  if (existing && Number(existing.group_id) !== Number(groupId)) {
    return res.status(404).json({ error: 'Betalningen hittades inte.' });
  }
  if (!existing) {
    return res.status(404).json({ error: 'Betalningen hittades inte.' });
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE settlements
      SET payer_id = ?, receiver_id = ?, amount = ?, settled_at = COALESCE(?, settled_at)
      WHERE id = ?
    `).run(payer_id, receiver_id, amount, settledAt, settlementId);

    logActivity({
      eventType: 'settlement.updated',
      action: 'update',
      actorUserId: req.user.id,
      groupId,
      entityType: 'settlement',
      entityId: settlementId,
      metadata: {
        before: existing,
        after: {
          id: settlementId,
          group_id: groupId,
          payer_id,
          receiver_id,
          amount,
          settled_at: settledAt || existing.settled_at,
        },
      },
      ipAddress,
    });
  })();

  const settlement = db.prepare(`
    SELECT s.id, s.group_id, s.payer_id, s.receiver_id, s.amount, s.settled_at,
           payer.full_name AS payer_full_name,
           receiver.full_name AS receiver_full_name
    FROM settlements s
    JOIN users payer ON payer.id = s.payer_id
    JOIN users receiver ON receiver.id = s.receiver_id
    WHERE s.id = ?
  `).get(settlementId);

  return res.json({ ...settlement, amount: Math.round(Number(settlement.amount)) });
});

router.delete('/:groupId/:settlementId', (req, res) => {
  const groupId = Number(req.params.groupId);
  const settlementId = Number(req.params.settlementId);
  const ipAddress = resolveRequestIp(req);

  if (!requireMembership(groupId, req.user.id)) {
    return res.status(403).json({ error: 'Du har inte åtkomst till den här gruppen.' });
  }
  if (isGroupArchived(groupId)) {
    return res.status(409).json({ error: 'Gruppen är arkiverad och skrivskyddad.' });
  }

  const existing = getSettlementSnapshot(settlementId);
  if (existing && Number(existing.group_id) !== Number(groupId)) {
    return res.status(404).json({ error: 'Betalningen hittades inte.' });
  }
  if (!existing) {
    return res.status(404).json({ error: 'Betalningen hittades inte.' });
  }

  db.transaction(() => {
    db.prepare('DELETE FROM settlements WHERE id = ?').run(settlementId);
    logActivity({
      eventType: 'settlement.deleted',
      action: 'delete',
      actorUserId: req.user.id,
      groupId,
      entityType: 'settlement',
      entityId: settlementId,
      metadata: {
        before: existing,
      },
      ipAddress,
    });
  })();

  return res.status(204).end();
});

router.get('/:groupId/balances', (req, res) => {
  const groupId = Number(req.params.groupId);
  if (!requireMembership(groupId, req.user.id)) {
    return res.status(403).json({ error: 'Du har inte åtkomst till den här gruppen.' });
  }

  try {
    return res.json(calculateBalances(groupId));
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Kunde inte räkna ut saldon.' });
  }
});

export default router;
