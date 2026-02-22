/**
 * @file ADR-0003: JWT in httpOnly cookies
 * @module docs/decisions
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

# ADR-0003: JWT in httpOnly Cookies

## Status

Accepted

## Context

The client needs to authenticate API requests after login. Common token
storage strategies:

| Strategy | XSS risk | CSRF risk | Complexity |
|---|---|---|---|
| localStorage JWT | High — JS can read token | None | Low |
| httpOnly cookie JWT | None — JS cannot access | Medium | Medium |
| Session-based (server state) | None | Medium | High |

## Decision

Use **JWT access tokens stored in httpOnly, Secure, SameSite=Strict
cookies**. A separate refresh token (longer-lived, also httpOnly) enables
silent renewal.

Token design is intentionally minimal:

```json
{
  "sub": "<nap_user uuid>",
  "ph": "<SHA-256 of permission canon>"
}
```

- `sub` identifies the user. All other user data (email, tenant, entity,
  roles) is hydrated server-side from `nap_users` + Redis permission cache.
- `ph` (permission hash) enables stale-token detection: if the cached
  permission canon's hash diverges from the JWT claim, the server sends
  `X-Token-Stale: 1` so the client can silently refresh.

## Consequences

### Positive

- httpOnly prevents JavaScript access — XSS cannot exfiltrate tokens.
- SameSite=Strict mitigates CSRF for same-origin requests.
- Minimal JWT payload keeps tokens small and avoids stale claims (no roles,
  email, or tenant code in the token).
- Permission hash enables efficient staleness detection without decoding
  the full permission set on every request.

### Negative

- Cookie-based auth requires `credentials: 'include'` on all fetch calls
  and proper CORS configuration.
- Refresh token rotation adds complexity (must handle concurrent refresh
  races gracefully).
- Cookies are sent on every request to the origin, including static assets
  (mitigated by serving static assets from Vite dev server or CDN).

### Mitigations

- Client fetch wrapper (`client.js`) always sets `credentials: 'include'`
  and handles 401 with automatic refresh + retry.
- Refresh endpoint is rate-limited and rotates the refresh token on each
  use.
- Access token TTL is short (15 minutes); refresh token TTL is 7 days.
