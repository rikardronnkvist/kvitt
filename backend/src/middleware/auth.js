import jwt from 'jsonwebtoken';
import { jwtSecret } from '../auth/token.js';

export default function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Saknar giltig autentisering.' });
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = {
      id: Number(payload.id),
      user_handle: payload.user_handle,
      is_admin: Boolean(payload.is_admin),
      current_passkey_id: payload.current_passkey_id != null ? Number(payload.current_passkey_id) : null,
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'Ogiltig eller utgången token.' });
  }
}
