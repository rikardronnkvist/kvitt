import express from 'express';
import rateLimit from 'express-rate-limit';
import { OAuthClientError, registerDcrClient } from '../oauth/clients.js';
import { oauthMessages } from '../i18n/sv-se.js';
import { resolveRequestIp, tryLogActivity } from '../utils/activity-log.js';

const router = express.Router();

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

router.post('/register', registrationRateLimit, (req, res) => {
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

export default router;
