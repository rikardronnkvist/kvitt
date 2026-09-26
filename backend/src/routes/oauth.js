import express from 'express';
import rateLimit from 'express-rate-limit';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { db } from '../db/database.js';
import requireAuth, { requireInteractiveSession } from '../middleware/auth.js';
import {
  OAuthClientError,
  registerDcrClient,
  resolveClient,
  verifyDcrClientSecret,
} from '../oauth/clients.js';
import {
  AUTHORIZATION_REQUEST_TTL_MS,
  AuthorizationRequestCapacityError,
  AuthorizationRequestError,
  authorizationRequestStore,
} from '../oauth/authorization-requests.js';
import {
  getMcpResourceUrl,
  getOAuthIssuer,
  OAUTH_DEFAULT_SCOPES,
  OAUTH_SUPPORTED_SCOPES,
  oauthResourceMatches,
} from '../oauth/config.js';
import { redirectUriMatches } from '../oauth/redirect.js';
import {
  issueTokenPair,
  OAuthTokenError,
  revokeGrant,
  revokeOAuthToken,
  rotateRefreshToken,
} from '../oauth/tokens.js';
import { oauthMessages } from '../i18n/sv-se.js';
import { resolveRequestIp, tryLogActivity } from '../utils/activity-log.js';
import { parseApiTokenScopes } from '../auth/token.js';

const oauthRouter = express.Router();
export const oauthApiRouter = express.Router();
export const oauthMetadataRouter = express.Router();
const formParser = express.urlencoded({ extended: false, limit: '32kb' });

const metadataRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'temporarily_unavailable',
    error_description: oauthMessages.metadataRateLimited,
  },
});
const registrationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'invalid_client_metadata',
    error_description: oauthMessages.registrationRateLimited,
  },
});
const tokenRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'temporarily_unavailable',
    error_description: oauthMessages.tokenRateLimited,
  },
});
const authorizationRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'temporarily_unavailable',
    error_description: oauthMessages.authorizationRateLimited,
  },
});
const authorizationRequestRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'temporarily_unavailable',
    error_description: oauthMessages.authorizationRequestRateLimited,
  },
});
const grantReadRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: oauthMessages.grantReadRateLimited },
});
const grantMutationRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: oauthMessages.grantMutationRateLimited },
});

function authorizationServerMetadata() {
  const issuer = getOAuthIssuer();
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: OAUTH_SUPPORTED_SCOPES,
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: 'https://github.com/rikardronnkvist/kvitt',
  };
}

oauthMetadataRouter.get('/.well-known/oauth-authorization-server', metadataRateLimit, (_req, res) => {
  return res.json(authorizationServerMetadata());
});
oauthMetadataRouter.get('/.well-known/openid-configuration', metadataRateLimit, (_req, res) => {
  return res.json(authorizationServerMetadata());
});

oauthRouter.post('/register', registrationRateLimit, (req, res) => {
  try {
    const registration = registerDcrClient(req.body);
    tryLogActivity({
      eventType: 'oauth.client_registered',
      action: 'create',
      entityType: 'oauth_client',
      metadata: {
        client_id: registration.client_id,
        client_name: registration.client_name || null,
        token_endpoint_auth_method: registration.token_endpoint_auth_method,
      },
      ipAddress: resolveRequestIp(req),
    });
    return res.status(201).json(registration);
  } catch (error) {
    if (error instanceof OAuthClientError) {
      return res.status(400).json({
        error: error.code,
        error_description: oauthMessages.invalidClientMetadata,
      });
    }
    throw error;
  }
});

function buildAuthorizationRedirect(redirectUri, params) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function redirectableError(redirectUri, state, error, errorDescription) {
  return {
    error,
    error_description: errorDescription,
    redirect_uri: redirectUri,
    redirect_to: buildAuthorizationRedirect(redirectUri, {
      error,
      error_description: errorDescription,
      state,
      iss: getOAuthIssuer(),
    }),
  };
}

function getClientHost(client) {
  const source = client.kind === 'cimd' ? client.clientId : client.clientUri;
  if (!source) {
    return null;
  }
  try {
    return new URL(source).hostname;
  } catch {
    return null;
  }
}

function getConsentTrustIndicator(client, redirectUri) {
  const source = client.kind === 'cimd' ? client.clientId : redirectUri;
  return {
    host: new URL(source).host,
    source: client.kind === 'cimd' ? 'client_metadata' : 'redirect_uri',
  };
}

function parseRequestedScopes(value) {
  if (value === undefined || value === null || value === '') {
    return [...OAUTH_DEFAULT_SCOPES];
  }
  if (typeof value !== 'string' || value.length > 1000) {
    return null;
  }
  const scopes = [...new Set(value.split(/\s+/u).filter(Boolean))];
  if (!scopes.length || !scopes.every((scope) => OAUTH_SUPPORTED_SCOPES.includes(scope))) {
    return null;
  }
  return scopes;
}

async function validateAuthorizationRequest(input, userId) {
  const clientId = typeof input?.client_id === 'string' && input.client_id.length <= 2048
    ? input.client_id
    : '';
  let client;
  try {
    client = await resolveClient(clientId);
  } catch {
    return {
      ok: false,
      status: 400,
      body: { error: 'invalid_client', error_description: oauthMessages.invalidClient },
    };
  }

  const redirectUri = typeof input?.redirect_uri === 'string' && input.redirect_uri.length <= 4096
    ? input.redirect_uri
    : '';
  if (!redirectUriMatches(redirectUri, client.redirectUris)) {
    return {
      ok: false,
      status: 400,
      body: { error: 'invalid_request', error_description: oauthMessages.invalidRedirectUri },
    };
  }

  const state = typeof input?.state === 'string' && input.state.length <= 2048 ? input.state : null;
  if (input?.state !== undefined && state === null) {
    return {
      ok: false,
      status: 400,
      body: redirectableError(redirectUri, null, 'invalid_request', oauthMessages.invalidRequest),
    };
  }
  if (input?.response_type !== 'code') {
    return {
      ok: false,
      status: 400,
      body: redirectableError(
        redirectUri,
        state,
        'unsupported_response_type',
        oauthMessages.unsupportedResponseType,
      ),
    };
  }

  const challenge = input?.code_challenge;
  if (
    input?.code_challenge_method !== 'S256'
    || typeof challenge !== 'string'
    || !/^[A-Za-z0-9_-]{43,128}$/u.test(challenge)
  ) {
    return {
      ok: false,
      status: 400,
      body: redirectableError(redirectUri, state, 'invalid_request', oauthMessages.invalidRequest),
    };
  }

  const resource = input?.resource || getMcpResourceUrl();
  if (!oauthResourceMatches(resource, getMcpResourceUrl())) {
    return {
      ok: false,
      status: 400,
      body: redirectableError(redirectUri, state, 'invalid_target', oauthMessages.invalidTarget),
    };
  }

  const requestedScopes = parseRequestedScopes(input?.scope);
  if (!requestedScopes) {
    return {
      ok: false,
      status: 400,
      body: redirectableError(redirectUri, state, 'invalid_scope', oauthMessages.invalidScope),
    };
  }

  const existingGrant = db.prepare(`
    SELECT scopes
    FROM oauth_grants
    WHERE user_id = ? AND client_id = ? AND resource = ? AND revoked_at IS NULL
  `).get(userId, client.clientId, getMcpResourceUrl());
  const trustIndicator = getConsentTrustIndicator(client, redirectUri);

  return {
    ok: true,
    client,
    clientId: client.clientId,
    redirectUri,
    state,
    challenge,
    requestedScopes,
    resource: getMcpResourceUrl(),
    response: {
      client: {
        name: client.clientName,
        uri: client.clientUri,
        logo_uri: client.logoUri,
        host: trustIndicator.host,
        kind: client.kind,
        trust_host: trustIndicator.host,
        trust_source: trustIndicator.source,
      },
      redirect_host: new URL(redirectUri).hostname,
      redirect_uri: redirectUri,
      requested_scopes: requestedScopes,
      existing_grant_scopes: existingGrant ? parseApiTokenScopes(existingGrant.scopes) : [],
    },
  };
}

function sendAuthorizationValidation(res, validation) {
  if (!validation.ok) {
    return res.status(validation.status).json(validation.body);
  }
  return res.json(validation.response);
}

function denyAuthorizationRequest(req, res, validation) {
  tryLogActivity({
    eventType: 'oauth.grant_denied',
    action: 'deny',
    actorUserId: req.user.id,
    targetUserId: req.user.id,
    entityType: 'oauth_grant',
    metadata: { client_id: validation.clientId, resource: validation.resource },
    ipAddress: resolveRequestIp(req),
  });
  return res.json({
    redirect_uri: validation.redirectUri,
    redirect_to: buildAuthorizationRedirect(validation.redirectUri, {
      error: 'access_denied',
      error_description: oauthMessages.accessDenied,
      state: validation.state,
      iss: getOAuthIssuer(),
    }),
  });
}

function approveAuthorizationRequest(req, res, validation) {
  const finalScopes = validation.requestedScopes.filter(
    (scope) => scope !== 'expenses:write' || req.body.allow_write,
  );
  const grantId = randomUUID();
  const authorizationCode = randomBytes(32).toString('base64url');
  const codeHash = createHash('sha256').update(authorizationCode).digest('hex');
  const approve = db.transaction(() => {
    const previousGrant = db.prepare(`
      SELECT id, scopes, revoked_at
      FROM oauth_grants
      WHERE user_id = ? AND client_id = ? AND resource = ?
    `).get(req.user.id, validation.clientId, validation.resource);
    const previousScopes = previousGrant
      ? parseApiTokenScopes(previousGrant.scopes)
      : [];
    const scopesChanged = previousGrant && (
      previousScopes.length !== finalScopes.length
      || previousScopes.some((scope) => !finalScopes.includes(scope))
    );

    if (previousGrant && (previousGrant.revoked_at || scopesChanged)) {
      db.prepare(`
        UPDATE oauth_tokens
        SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
        WHERE grant_id = ?
      `).run(previousGrant.id);
      db.prepare(`
        DELETE FROM oauth_authorization_codes
        WHERE grant_id = ?
      `).run(previousGrant.id);
    }

    db.prepare(`
      INSERT INTO oauth_grants (id, user_id, client_id, client_name, scopes, resource)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, client_id, resource) DO UPDATE SET
        client_name = excluded.client_name,
        scopes = excluded.scopes,
        revoked_at = NULL
    `).run(
      grantId,
      req.user.id,
      validation.clientId,
      validation.client.clientName,
      JSON.stringify(finalScopes),
      validation.resource,
    );
    const grant = db.prepare(`
      SELECT id
      FROM oauth_grants
      WHERE user_id = ? AND client_id = ? AND resource = ?
    `).get(req.user.id, validation.clientId, validation.resource);
    db.prepare(`
      INSERT INTO oauth_authorization_codes (
        code_hash,
        grant_id,
        client_id,
        redirect_uri,
        code_challenge,
        scopes,
        resource,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+60 seconds'))
    `).run(
      codeHash,
      grant.id,
      validation.clientId,
      validation.redirectUri,
      validation.challenge,
      JSON.stringify(finalScopes),
      validation.resource,
    );
    return grant.id;
  });
  const persistedGrantId = approve();

  tryLogActivity({
    eventType: 'oauth.grant_approved',
    action: 'approve',
    actorUserId: req.user.id,
    targetUserId: req.user.id,
    entityType: 'oauth_grant',
    metadata: {
      grant_id: persistedGrantId,
      client_id: validation.clientId,
      scopes: finalScopes,
      resource: validation.resource,
    },
    ipAddress: resolveRequestIp(req),
  });

  return res.json({
    redirect_uri: validation.redirectUri,
    redirect_to: buildAuthorizationRedirect(validation.redirectUri, {
      code: authorizationCode,
      state: validation.state,
      iss: getOAuthIssuer(),
    }),
  });
}

const authorizationDecisionHandlers = new Map([
  [true, approveAuthorizationRequest],
  [false, denyAuthorizationRequest],
]);

oauthApiRouter.post(
  '/authorize/request',
  authorizationRequestRateLimit,
  (req, res) => {
    const keys = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? Object.keys(req.body)
      : [];
    if (keys.length !== 1 || keys[0] !== 'query') {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: oauthMessages.invalidAuthorizationRequestHandle,
      });
    }

    try {
      const { handle } = authorizationRequestStore.create(req.body.query);
      res.set('Cache-Control', 'no-store');
      return res.status(201).json({
        request: handle,
        expires_in: Math.floor(AUTHORIZATION_REQUEST_TTL_MS / 1000),
      });
    } catch (error) {
      if (!(error instanceof AuthorizationRequestError)) {
        throw error;
      }
      const status = error instanceof AuthorizationRequestCapacityError ? 503 : 400;
      return res.status(status).json({
        error: status === 400 ? 'invalid_request' : 'temporarily_unavailable',
        error_description: status === 400
          ? oauthMessages.invalidAuthorizationRequestHandle
          : oauthMessages.authorizationRequestUnavailable,
      });
    }
  },
);

oauthApiRouter.get(
  '/authorize/request/:handle',
  authorizationRateLimit,
  requireAuth,
  requireInteractiveSession,
  (req, res) => {
    const storedRequest = authorizationRequestStore.resolve(req.params.handle, req.user.id);
    res.set('Cache-Control', 'no-store');
    if (!storedRequest) {
      return res.status(404).json({
        error: 'invalid_request',
        error_description: oauthMessages.authorizationRequestExpired,
      });
    }
    return res.json({
      request: storedRequest.parameters,
      expires_at: new Date(storedRequest.expiresAt).toISOString(),
    });
  },
);

oauthApiRouter.post(
  '/authorize/validate',
  authorizationRateLimit,
  requireAuth,
  requireInteractiveSession,
  async (req, res) => {
    const validation = await validateAuthorizationRequest(req.body, req.user.id);
    return sendAuthorizationValidation(res, validation);
  },
);

oauthApiRouter.post(
  '/authorize/decision',
  authorizationRateLimit,
  requireAuth,
  requireInteractiveSession,
  async (req, res) => {
    const validation = await validateAuthorizationRequest(req.body, req.user.id);
    if (!validation.ok) {
      return res.status(validation.status).json(validation.body);
    }
    if (typeof req.body.approved !== 'boolean' || typeof req.body.allow_write !== 'boolean') {
      return res.status(400).json(
        redirectableError(
          validation.redirectUri,
          validation.state,
          'invalid_request',
          oauthMessages.invalidRequest,
        ),
      );
    }
    const decisionHandler = authorizationDecisionHandlers.get(req.body.approved);
    return decisionHandler(req, res, validation);
  },
);

function parseBasicCredentials(header) {
  if (typeof header !== 'string' || !header.startsWith('Basic ')) {
    return null;
  }
  try {
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 1) {
      return null;
    }
    return {
      clientId: decodeURIComponent(decoded.slice(0, separator)),
      clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

async function authenticateClient(req) {
  const basic = parseBasicCredentials(req.headers.authorization);
  const bodyClientId = typeof req.body?.client_id === 'string' ? req.body.client_id : null;
  const clientId = basic?.clientId || bodyClientId;
  if (!clientId || (basic && bodyClientId && basic.clientId !== bodyClientId)) {
    throw new OAuthClientError();
  }

  const client = await resolveClient(clientId);
  if (client.tokenEndpointAuthMethod === 'none') {
    if (basic || req.body?.client_secret) {
      throw new OAuthClientError();
    }
  } else if (client.tokenEndpointAuthMethod === 'client_secret_basic') {
    if (!basic || !verifyDcrClientSecret(clientId, basic.clientSecret)) {
      throw new OAuthClientError();
    }
  } else if (
    client.tokenEndpointAuthMethod !== 'client_secret_post'
    || basic
    || !verifyDcrClientSecret(clientId, req.body?.client_secret)
  ) {
    throw new OAuthClientError();
  }

  if (client.kind === 'dcr') {
    db.prepare('UPDATE oauth_clients SET last_used_at = CURRENT_TIMESTAMP WHERE client_id = ?').run(clientId);
  }
  return client;
}

function tokenError(res, error, errorDescription, status = 400) {
  if (status === 401) {
    res.set('WWW-Authenticate', 'Basic realm="oauth/token"');
  }
  return res.status(status).json({ error, error_description: errorDescription });
}

function validCodeVerifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._~-]{43,128}$/u.test(value);
}

function pkceMatches(verifier, challenge) {
  const actual = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
  const expected = Buffer.from(challenge);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function tokenResponse(res, pair) {
  return res.json({
    access_token: pair.accessToken,
    token_type: 'Bearer',
    expires_in: pair.expiresIn,
    refresh_token: pair.refreshToken,
    scope: pair.scopes.join(' '),
  });
}

function preventTokenResponseCaching(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
}

function exchangeAuthorizationCode(body, client) {
  if (
    typeof body.code !== 'string'
    || typeof body.redirect_uri !== 'string'
    || !validCodeVerifier(body.code_verifier)
  ) {
    return { error: 'invalid_grant', description: oauthMessages.invalidAuthorizationCode };
  }
  const codeHash = createHash('sha256').update(body.code).digest('hex');

  const exchange = db.transaction(() => {
    const record = db.prepare(`
      SELECT
        code.grant_id,
        code.client_id,
        code.redirect_uri,
        code.code_challenge,
        code.scopes,
        code.resource,
        code.expires_at,
        code.used_at,
        grant.revoked_at AS grant_revoked_at
      FROM oauth_authorization_codes code
      JOIN oauth_grants grant ON grant.id = code.grant_id
      WHERE code.code_hash = ?
    `).get(codeHash);
    if (!record) {
      return { error: 'invalid_grant', description: oauthMessages.invalidAuthorizationCode };
    }
    const now = db.prepare('SELECT CURRENT_TIMESTAMP AS now').get().now;
    if (
      record.client_id !== client.clientId
      || record.redirect_uri !== body.redirect_uri
      || !pkceMatches(body.code_verifier, record.code_challenge)
      || (body.resource && !oauthResourceMatches(body.resource, record.resource))
    ) {
      return { error: 'invalid_grant', description: oauthMessages.invalidAuthorizationCode };
    }
    if (record.used_at) {
      revokeGrant(record.grant_id);
      return { error: 'invalid_grant', description: oauthMessages.invalidAuthorizationCode };
    }
    if (record.expires_at <= now || record.grant_revoked_at) {
      return { error: 'invalid_grant', description: oauthMessages.invalidAuthorizationCode };
    }

    db.prepare(`
      UPDATE oauth_authorization_codes
      SET used_at = CURRENT_TIMESTAMP
      WHERE code_hash = ? AND used_at IS NULL
    `).run(codeHash);
    return {
      pair: issueTokenPair({
        grantId: record.grant_id,
        scopes: parseApiTokenScopes(record.scopes),
        resource: record.resource,
      }),
    };
  });
  return exchange();
}

function handleAuthorizationCodeGrant(body, client, res) {
  const result = exchangeAuthorizationCode(body, client);
  if (result.error) {
    return tokenError(res, result.error, result.description);
  }
  return tokenResponse(res, result.pair);
}

function handleRefreshTokenGrant(body, client, res) {
  const requestedScopes = body.scope === undefined
    ? undefined
    : parseRequestedScopes(body.scope);
  if (body.scope !== undefined && !requestedScopes) {
    return tokenError(res, 'invalid_scope', oauthMessages.invalidScope);
  }
  try {
    const pair = rotateRefreshToken(
      body.refresh_token,
      client.clientId,
      body.resource,
      requestedScopes,
    );
    return tokenResponse(res, pair);
  } catch (error) {
    if (error instanceof OAuthTokenError && error.code === 'invalid_scope') {
      return tokenError(res, 'invalid_scope', oauthMessages.invalidScope);
    }
    return tokenError(res, 'invalid_grant', oauthMessages.invalidRefreshToken);
  }
}

function handleUnsupportedGrant(_body, _client, res) {
  return tokenError(res, 'unsupported_grant_type', oauthMessages.unsupportedGrantType);
}

const tokenGrantHandlers = new Map([
  ['authorization_code', handleAuthorizationCodeGrant],
  ['refresh_token', handleRefreshTokenGrant],
]);

oauthRouter.post('/token', preventTokenResponseCaching, tokenRateLimit, formParser, async (req, res) => {
  let client;
  try {
    client = await authenticateClient(req);
  } catch {
    return tokenError(res, 'invalid_client', oauthMessages.invalidClientAuthentication, 401);
  }

  const grantHandler = tokenGrantHandlers.get(req.body.grant_type) ?? handleUnsupportedGrant;
  return grantHandler(req.body, client, res);
});

oauthRouter.post('/revoke', preventTokenResponseCaching, tokenRateLimit, formParser, async (req, res) => {
  let client;
  try {
    client = await authenticateClient(req);
  } catch {
    return tokenError(res, 'invalid_client', oauthMessages.invalidClientAuthentication, 401);
  }
  revokeOAuthToken(req.body.token, client.clientId);
  return res.status(200).send();
});

oauthApiRouter.get('/grants', grantReadRateLimit, requireAuth, requireInteractiveSession, (req, res) => {
  const grants = db.prepare(`
    SELECT
      grant.id,
      grant.client_id,
      grant.client_name,
      grant.scopes,
      grant.created_at,
      grant.last_used_at,
      client.client_uri
    FROM oauth_grants grant
    LEFT JOIN oauth_clients client ON client.client_id = grant.client_id
    WHERE grant.user_id = ? AND grant.revoked_at IS NULL
    ORDER BY grant.created_at DESC, grant.id DESC
  `).all(req.user.id);

  return res.json({
    grants: grants.map((grant) => ({
      id: grant.id,
      client_name: grant.client_name,
      client_host: getClientHost({
        clientId: grant.client_id,
        clientUri: grant.client_uri,
        kind: grant.client_id.startsWith('https://') ? 'cimd' : 'dcr',
      }),
      scopes: parseApiTokenScopes(grant.scopes),
      created_at: grant.created_at,
      last_used_at: grant.last_used_at,
    })),
  });
});

oauthApiRouter.delete(
  '/grants/:id',
  grantMutationRateLimit,
  requireAuth,
  requireInteractiveSession,
  (req, res) => {
    const grant = db.prepare(`
      SELECT id, client_id
      FROM oauth_grants
      WHERE id = ? AND user_id = ? AND revoked_at IS NULL
    `).get(req.params.id, req.user.id);
    if (!grant) {
      return res.status(404).json({ error: oauthMessages.grantNotFound });
    }

    revokeGrant(grant.id);
    tryLogActivity({
      eventType: 'oauth.grant_revoked',
      action: 'revoke',
      actorUserId: req.user.id,
      targetUserId: req.user.id,
      entityType: 'oauth_grant',
      metadata: { grant_id: grant.id, client_id: grant.client_id },
      ipAddress: resolveRequestIp(req),
    });
    return res.status(204).send();
  },
);

export default oauthRouter;
