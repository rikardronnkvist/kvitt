const QR_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;

export function isQrLoginToken(value) {
  return typeof value === 'string' && QR_TOKEN_PATTERN.test(value);
}

export function getValidatedJwt(result) {
  return typeof result?.jwt === 'string' && result.jwt.length <= 4096 && JWT_PATTERN.test(result.jwt)
    ? result.jwt : null;
}
