import jwt from 'jsonwebtoken';
import { getAuthUserById, jwtSecret, verifyApiToken } from '../auth/token.js';
import { getMcpResourceUrl, oauthResourceMatches } from '../oauth/config.js';
import { verifyOAuthAccessToken } from '../oauth/tokens.js';
import { oauthMessages } from '../i18n/sv-se.js';

export function requireScope(scope) {
  return (req, res, next) => {
    if (!['api_token', 'oauth'].includes(req.auth?.type) || req.auth.scopes?.includes(scope)) {
      return next();
    }

    const error = req.auth?.type === 'oauth'
      ? oauthMessages.missingScope
      : 'Din API-token saknar behörighet för den här åtgärden.';
    return res.status(403).json({ error });
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
    return ['settlements:read', 'expenses:read'].some(hasScope);
  }

  return req.baseUrl === '/api/auth' && req.method === 'GET' && req.path === '/mcp/me';
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
      expiresAt: apiToken.expiresAt,
      scopes: apiToken.scopes,
    };
    return next();
  }

  if (token.startsWith('kvitt_oat_')) {
    const oauthToken = verifyOAuthAccessToken(token);
    if (!oauthToken || !oauthResourceMatches(oauthToken.resource, getMcpResourceUrl())) {
      return res.status(401).json({ error: oauthMessages.invalidAccessToken });
    }
    // Kvitt's authorization server, MCP service and API form one trust domain.
    // Forwarding this resource-bound token to the API is therefore not third-party token passthrough.
    if (!isAllowedApiTokenRequest(req, oauthToken.scopes)) {
      return res.status(403).json({ error: oauthMessages.missingScope });
    }

    req.user = oauthToken.user;
    req.auth = {
      type: 'oauth',
      grantId: oauthToken.grantId,
      clientId: oauthToken.clientId,
      tokenId: oauthToken.id,
      expiresAt: oauthToken.expiresAt,
      scopes: oauthToken.scopes,
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
