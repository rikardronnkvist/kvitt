# Security Policy

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.

Report security issues by email to **rikard@ronnkvist.nu**. Include:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Affected versions (if known)

I will acknowledge receipt within resonable time (this is a hobby project) and aim to fix confirmed vulnerabilities.

## Reviewed SonarCloud Findings

The following three reports were reviewed against the current implementation and tests. This review does not change their status in SonarCloud. A maintainer with **Administer Issues** permission must manually mark each report as `falsepositive` and add a comment; that action remains pending.

- `AaDcii4SlacU-vKYuv1D` (`S5144`, `backend/src/oauth/clients.js:243`): CIMD metadata URLs must use HTTPS. Private and reserved IP ranges are rejected by default, and resolved addresses are pinned for the connection; redirect responses are rejected. The HTTPS document request has a five-second deadline and a 10 KiB response limit. DNS resolution happens before that request deadline. Private-address checks can be explicitly relaxed with `OAUTH_CIMD_ALLOW_PRIVATE=true`, intended only for isolated local development.
- `AaDciizUlacU-vKYuv1A` (`S6105`, `frontend/src/pages/OAuthAuthorize.jsx:95`): The browser navigates to an external OAuth redirect intentionally, but only when its `redirect_uri` matches the registered target and the destination has the same protocol, hostname, port, and path. HTTPS is required except for RFC 8252 loopback HTTP; credentials and fragments are rejected. OAuth response parameters such as `code` and `state` are carried in the query string.
- `AZ_6qCPvkJxHpW9fgYdx` (`S8475`, `frontend/src/components/QrLoginModal.jsx:44`): A claimed QR-login JWT is checked for JWT syntax and a 4096-character maximum, then verified through `/api/auth/me` before it is written to `localStorage`. The backend verifies the signed JWT when completing the QR login.
