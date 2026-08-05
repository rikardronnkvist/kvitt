import fs from 'node:fs';
import path from 'node:path';

const AVATAR_BASE_URL = '/uploads/avatars';

function resolveAvatarDirectory() {
  const configuredDirectory = process.env.AVATAR_STORAGE_PATH;
  if (configuredDirectory?.trim()) {
    return path.resolve(configuredDirectory.trim());
  }

  const dbPath = process.env.DB_PATH || '/app/data/kvitt.db';
  return path.resolve(path.dirname(dbPath), 'avatars');
}

export const avatarDirectory = resolveAvatarDirectory();

export function ensureAvatarDirectory() {
  fs.mkdirSync(avatarDirectory, { recursive: true });
}

export function getAvatarFilePath(fileName) {
  return path.join(avatarDirectory, fileName);
}

function normalizeAvatarVersion(avatarVersion) {
  const version = Number(avatarVersion);
  if (!Number.isFinite(version) || version < 0) {
    return 0;
  }
  return Math.floor(version);
}

export function toAvatarUrl(avatarPath, avatarVersion = 0) {
  if (typeof avatarPath !== 'string') {
    return null;
  }
  const trimmed = avatarPath.trim();
  if (!trimmed) {
    return null;
  }
  const version = normalizeAvatarVersion(avatarVersion);
  return `${AVATAR_BASE_URL}/${encodeURIComponent(trimmed)}?v=${version}`;
}

export function cleanupUserAvatarFiles(userId, keepFileName) {
  const prefix = `user-${userId}-`;
  let files = [];
  try {
    files = fs.readdirSync(avatarDirectory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const file of files) {
    if (!file.isFile()) {
      continue;
    }
    if (!file.name.startsWith(prefix) || file.name === keepFileName) {
      continue;
    }

    try {
      fs.rmSync(getAvatarFilePath(file.name), { force: true });
    } catch {
      // best-effort cleanup
    }
  }
}
