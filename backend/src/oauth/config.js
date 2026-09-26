import { getFrontendPublicOrigin } from '../utils/public-origin.js';
import { API_TOKEN_SCOPES } from '../auth/token.js';

export const OAUTH_SUPPORTED_SCOPES = Object.freeze([
  API_TOKEN_SCOPES.groupsRead,
  API_TOKEN_SCOPES.expensesRead,
  API_TOKEN_SCOPES.settlementsRead,
  API_TOKEN_SCOPES.expensesWrite,
]);

export const OAUTH_DEFAULT_SCOPES = Object.freeze([
  API_TOKEN_SCOPES.groupsRead,
  API_TOKEN_SCOPES.expensesRead,
  API_TOKEN_SCOPES.settlementsRead,
]);

function withoutTrailingSlash(value) {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }
  return value.slice(0, end);
}

export function getOAuthIssuer() {
  return withoutTrailingSlash(process.env.OAUTH_ISSUER || getFrontendPublicOrigin());
}

export function getMcpResourceUrl() {
  return withoutTrailingSlash(process.env.MCP_RESOURCE_URL || `${getOAuthIssuer()}/mcp`);
}

export function oauthResourceMatches(left, right) {
  return typeof left === 'string'
    && typeof right === 'string'
    && withoutTrailingSlash(left) === withoutTrailingSlash(right);
}
