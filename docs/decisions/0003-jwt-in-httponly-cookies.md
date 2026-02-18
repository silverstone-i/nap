# 0003. JWT in httpOnly Cookies over localStorage Tokens

**Date:** 2025-02-17
**Status:** accepted
**Author:** NapSoft

## Context

NAP's API requires stateless authentication that works across a React SPA frontend and an Express API backend. The two primary browser-based token storage strategies are localStorage (read by JavaScript, sent via `Authorization` header) and httpOnly cookies (set by the server, transmitted automatically by the browser). NAP handles sensitive financial data, making XSS-based token theft a critical threat to mitigate.

## Decision

Authentication tokens are stored as httpOnly cookies:

- **`auth_token`** — short-lived JWT (15 min), signed with `iss: 'nap-serv'`, `aud: 'nap-serv-api'`, `sub: userId`, `ph: permissionHash`, `exp`
- **`refresh_token`** — longer-lived JWT (7 days), used for full token rotation
- Both cookies use `httpOnly`, `Secure` (in production), and `SameSite` attributes
- Authentication flow: Passport Local Strategy with bcrypt → JWT signing → cookies set in response
- Client-side: `AuthContext` manages user state; all API calls use `credentials: 'include'`; no token handling in JavaScript
- Tenant context and permissions are resolved per-request by `authRedis` middleware — NOT embedded in the JWT (keeping tokens small and avoiding stale permission claims)
- Permission staleness detection: SHA-256 hash of the user's policy set is stored as the `ph` JWT claim; `authRedis` compares it on each request and signals the client with `X-Token-Stale: 1` when permissions have changed

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| localStorage + `Authorization` header | Simple to implement; works across origins; no CSRF concern | Vulnerable to XSS — any injected script can read and exfiltrate the token; requires manual token management in client code; token not automatically sent |
| Session cookies (server-side sessions) | No token in browser at all; easy to invalidate | Requires server-side session store; breaks stateless API design; sticky sessions or shared store needed for horizontal scaling |

## Consequences

**Positive:**
- XSS protection — JavaScript cannot access httpOnly cookies, so injected scripts cannot steal tokens
- Automatic transmission — browser sends cookies on every request without client-side logic
- No client-side token management — eliminates an entire class of token-handling bugs
- CSRF mitigated via `SameSite` cookie attribute

**Negative:**
- Cookie size limits (~4 KB) constrain JWT payload — resolved by keeping permissions out of the JWT and resolving them server-side
- CSRF requires `SameSite` policy (or CSRF tokens) — accepted trade-off
- Cross-origin API consumption (e.g., mobile apps) would need a different token strategy — not currently required
