# RULES — Auth module

Governs `apps/api/src/modules/auth/`, `apps/api/src/middleware/requireAuth.ts`,
and the auth utilities `src/util/passwordHash.ts`, `src/util/tokens.ts`,
`src/util/cookies.ts`. Architecture:
[PRD 0004](../PRDs/0004-authentication-and-session-management.md),
[ADR-0004](../ADRs/0004-portal-user-login-and-tenant-selection.md),
[ADR-0014](../ADRs/0014-session-tokens-and-lifetimes.md),
[ADR-0015](../ADRs/0015-password-credential-storage.md).

## One hasher

Every writer of `admin.portal_users.password_hash` — login's opportunistic
rehash, the password-change route, the bootstrap script — imports
`hashPassword` from `src/util/passwordHash.ts`. No second hashing path may
exist (ADR-0015). Parameters come from `resolveArgon2Params(env)`, which
throws below the OWASP baseline: configuration raises costs, never lowers
them.

## Token contract

- The access JWT carries exactly `sub` + `ph`, HS256, 15 minutes
  (`ACCESS_TOKEN_TTL_SECONDS`). Do not add claims — ADR-0004 rejected a
  tenant claim deliberately.
- `ph` is `PH_PLACEHOLDER` until the RBAC PR computes the real permission
  hash (ADR-0012 owns the `X-Token-Stale` flow that consumes it).
- The refresh token is `<sessionId>.<verifier>`: the `admin.sessions` row id
  plus 256 bits of CSPRNG output, with only `sha256(verifier)` stored in
  `token_hash`. The embedded id is load-bearing — it is what makes
  rotation-reuse detectable with a single hash column (a replayed token still
  names its row, whose hash no longer matches: theft evidence, session
  revoked; ADR-0014 decision 3). A guessed session id whose verifier
  mismatches also revokes that session — denial of service only, and a uuid
  carries 122 random bits.
- Because the token embeds the id, `createSession` generates the uuid
  app-side and the sessions model declares `id` without a SQL default
  (pg-schemata drops defaulted uuid primary keys from the insert column set,
  which would discard the supplied value).

## Cookies

`nap_access` (`Path=/api`, 15 minutes) and `nap_refresh`
(`Path=/api/auth/v1`, expiring at the session's absolute expiry), both
httpOnly; `secure`/`sameSite` come from `AppConfig`. The refresh cookie spans
the whole auth router, not just `/refresh`: logout and password-change
identify the caller's session by the refresh token's embedded id — the
access JWT cannot name a session. Clearing a cookie must repeat its exact
path.

## Refusal responses

All login refusals — unknown email, wrong password, NULL `password_hash`,
non-active user, no binding in an active tenant — return one byte-identical
401, and the unknown/NULL paths still pay one argon2id verification against
a dummy digest (no user enumeration, PRD 0004). All refresh refusals are
likewise one indistinguishable 401.

## Session policy

The effective policy — the user's idle choice clamped to the tightest tenant
bounds, the shortest absolute lifetime — is recomputed at login and at every
refresh over the user's active-binding set, and never stored on the session
row. That makes a tenant switch policy-neutral (the binding set is
unchanged) while an admin's tightening lands at the next refresh, both per
ADR-0014. Partial session updates go through `updateWhere` (a full
`update()` nulls absent columns), and rotation keys its `WHERE` on the old
`token_hash` so a concurrent double-refresh resolves as reuse.

## Active tenant

Until the RBAC PR adds the Redis key of ADR-0004 decision 6, the active
tenant is exactly the fallback rule: `MAX(last_used_at)` over active
bindings in active tenants (`resolveActiveTenant` in
`modules/auth/domain/activeTenant.ts`), and `switch-tenant` persists nothing
but that binding's `last_used_at`. Keep `resolveActiveTenant` the single
seam the RBAC PR wraps.

## Out of scope here

Rate limiting/lockout, password reset, MFA, SSO, and session inventory are
open questions in PRD 0004; expired-session purging is a follow-up; the
client half of the idle warning (input tracking, refresh-on-activity) is
web-app scope.
