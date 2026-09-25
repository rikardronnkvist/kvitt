import jwt from 'jsonwebtoken';
import { getAuthUserById, jwtSecret, verifyApiToken } from '../auth/token.js';

export function requireScope(scope) {
  return (req, res, next) => {
    if (req.auth?.type !== 'api_token' || req.auth.scopes?.includes(scope)) {
      return next();
    }

    return res.status(403).json({ error: 'Din API-token saknar behörighet för den här åtgärden.' });
  };
}

export function requireInteractiveSession(req, res, next) {
  if (req.auth?.type === 'jwt') {
    return next();
  }

  return res.status(403).json({ error: 'Den här åtgärden kräver en inloggad session.' });
}

function isAllowedApiTokenRequest(req, scopes) {
  const hasScope = (scope) => scopes.includes(scope);
  const isGroupPath = req.path === '/' || /^\/[^/]+$/u.test(req.path);

  if (req.baseUrl === '/api/groups' && req.method === 'GET' && isGroupPath) {
    return hasScope('groups:read');
  }

  if (req.baseUrl === '/api/expenses') {
    if (req.method === 'GET' && (req.path === '/categories' || isGroupPath)) {
      return hasScope('expenses:read');
    }
    if (req.method === 'POST' && isGroupPath) {
      return hasScope('expenses:write');
    }
    if ((req.method === 'PUT' || req.method === 'DELETE') && /^\/\d+\/\d+$/u.test(req.path)) {
      return hasScope('expenses:write');
    }
  }

  if (req.baseUrl === '/api/settlements' && req.method === 'GET' && /^\/\d+(?:\/balances)?$/u.test(req.path)) {
    return hasScope('settlements:read') || hasScope('expenses:read');
  }

  if (req.baseUrl === '/api/auth' && req.method === 'GET' && req.path === '/mcp/me') {
    return true;
  }

  return false;
}

export default function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Saknar giltig autentisering.' });
  }

  const token = header.slice('Bearer '.length).trim();

  if (token.startsWith('kvitt_pat_')) {
    const apiToken = verifyApiToken(token);
    if (!apiToken) {
      return res.status(401).json({ error: 'Ogiltig eller utgången token.' });
    }
    if (!isAllowedApiTokenRequest(req, apiToken.scopes)) {
      return res.status(403).json({ error: 'Din API-token saknar behörighet för den här åtgärden.' });
    }

    req.user = apiToken.user;
    req.auth = {
      type: 'api_token',
      tokenId: apiToken.id,
      scopes: apiToken.scopes,
    };
    return next();
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = getAuthUserById(Number(payload.id));
    if (!user) {
      return res.status(401).json({ error: 'Ogiltig eller utgången token.' });
    }
    req.user = {
      ...user,
      current_passkey_id: payload.current_passkey_id != null ? Number(payload.current_passkey_id) : null,
    };
    req.auth = { type: 'jwt', scopes: null };
    return next();
  } catch {
    return res.status(401).json({ error: 'Ogiltig eller utgången token.' });
  }
}
