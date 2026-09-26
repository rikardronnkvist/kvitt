import { db } from '../db/database.js';

export function resolveRequestIp(req) {
  if (!req) {
    return null;
  }
  return req.ip || req.socket?.remoteAddress || null;
}

function toNullableInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function serializeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  try {
    return JSON.stringify(metadata);
  } catch {
    return null;
  }
}

export function logActivity({
  eventType,
  action,
  actorUserId = null,
  targetUserId = null,
  groupId = null,
  entityType,
  entityId = null,
  metadata = null,
  ipAddress = null,
}) {
  if (!eventType || !action || !entityType) {
    return;
  }

  db.prepare(`
    INSERT INTO activity_logs (
      event_type,
      action,
      actor_user_id,
      target_user_id,
      group_id,
      entity_type,
      entity_id,
      metadata_json,
      ip_address
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventType,
    action,
    toNullableInteger(actorUserId),
    toNullableInteger(targetUserId),
    toNullableInteger(groupId),
    entityType,
    toNullableInteger(entityId),
    serializeMetadata(metadata),
    ipAddress || null,
  );
}

export function tryLogActivity(input) {
  try {
    logActivity(input);
  } catch (error) {
    console.error('Failed to persist activity log', error);
  }
}
