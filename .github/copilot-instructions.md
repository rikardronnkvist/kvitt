# Project: Kvitt

Kvitt is a self-hosted expense splitting app for groups.
The product helps users create groups, add expenses, calculate balances, and settle up.

## Tech stack
- Backend: Node.js + Express
- Frontend: React + Vite
- Database: SQLite
- Auth: JWT + WebAuthn/passkeys
- Deployment: Docker Compose
- CI/CD: GitHub Actions

## Architecture rules
- Keep backend and frontend clearly separated.
- Never call the database directly from the frontend.
- Keep API contracts explicit and stable.
- Prefer small, focused modules over large abstractions.

## UI rules
- Use a modern, minimal UI.
- Prefer Tailwind CSS and Lucide icons.
- Use clean typography and restrained color usage.
- Avoid generic SaaS starter styling.

## Security rules
- Never expose secrets in logs or UI.
- Validate all input on the server.
- Assume all client input is untrusted.
- Keep auth/session logic consistent and simple.

## Coding rules
- Write readable, typed, maintainable code.
- Follow existing patterns in the repository.
- Make minimal, targeted changes unless explicitly asked otherwise.
- Prefer pragmatic solutions over clever ones.

## Boundaries
- Commit freely as work progresses or when a logical unit is complete.
- Never run `git push`. Do not push to any remote under any circumstances.
