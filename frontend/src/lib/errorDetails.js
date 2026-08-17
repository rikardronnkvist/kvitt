const MAX_ERROR_DETAILS = 20;
const detailsByMessage = new Map();

export function registerErrorDetails(message, details) {
  if (!message || !details) return;

  detailsByMessage.delete(message);
  detailsByMessage.set(message, details);

  while (detailsByMessage.size > MAX_ERROR_DETAILS) {
    detailsByMessage.delete(detailsByMessage.keys().next().value);
  }
}

export function getErrorDetails(message) {
  return detailsByMessage.get(message) || '';
}
