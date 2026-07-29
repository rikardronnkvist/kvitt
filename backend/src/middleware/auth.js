import jwt from 'jsonwebtoken';

export default function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Saknar giltig autentisering.' });
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'changeme-use-a-strong-secret');
    req.user = {
      id: Number(payload.id),
      full_name: payload.full_name ?? null,
      username: payload.username ?? null,
      user_handle: payload.user_handle,
      is_admin: Boolean(payload.is_admin),
      current_passkey_id: payload.current_passkey_id ? Number(payload.current_passkey_id) : null,
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'Ogiltig eller utgången token.' });
  }
}
