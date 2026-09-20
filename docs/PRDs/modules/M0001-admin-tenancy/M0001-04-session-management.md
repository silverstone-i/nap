# M0001-04: Session Management

## 1. Document Control

| Field                | Value                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                         |
| Type                 | Module Work Unit                                                                                    |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                   |
| Related architecture | [BFF](../../../architecture/bff.md)                                                                 |
| Related PRDs         | [M0001-03](M0001-03-authentication.md), [M0001-09](M0001-09-tenant-selection-and-support-access.md) |
| Related decisions    | None                                                                                                |
| Last reviewed        | 2026-09-20                                                                                          |

## 2. Purpose

Create, resolve, rotate, expire, and revoke browser sessions.

## 3. Scope

### Included

- Opaque session credentials and BFF cookies.
- Idle and absolute expiry.
- Rotation, revocation, and restricted password-change sessions.

### Excluded

- Password verification.
- Tenant selection and support-access rules.
- Persistent browser tokens outside the session cookie.

## 4. Actors And Permissions

| Actor                    | Operation                                                       | Result                             |
| ------------------------ | --------------------------------------------------------------- | ---------------------------------- |
| Authenticated user       | Read, rotate, or end own session                                | Apply operation to current session |
| Root or `platform_admin` | Revoke any user's session                                       | Revoke target session              |
| `support`                | Revoke a platform session or one targeting a non-Napsoft tenant | Revoke target session              |
| `support`                | Revoke a session targeting the Napsoft tenant                   | Deny                               |
| Anonymous caller         | Present cookie                                                  | Resolve or reject it               |

## 5. Concepts And Terminology

| Term          | Meaning                                             |
| ------------- | --------------------------------------------------- |
| Session token | Random 256-bit value held only by the browser       |
| Token hash    | HMAC-SHA-256 value stored in the database           |
| Rotation      | Replace the token and invalidate the previous token |
| Revocation    | Archive a session so it cannot resolve again        |

## 6. Functional Requirements

- M0001-04-R001: Successful authentication must create a session for the verified portal user.
- M0001-04-R002: Resolution must verify the token hash, account eligibility, expiry, and revocation before returning context.
- M0001-04-R003: Sessions must support immediate rotation, idle expiry, absolute expiry, and explicit revocation.
- M0001-04-R004: Unknown, tampered, expired, archived, or revoked sessions must not authenticate.
- M0001-04-R005: Session operations must preserve tenant and support context established by WU 9.

## 7. Business Rules And Invariants

- M0001-04-R006: Concurrent rotation or revocation must permit at most one successful state change for the same current token.
- M0001-04-R007: Support may revoke platform sessions and sessions targeting non-Napsoft tenants, but must not read or revoke a session targeting the Napsoft tenant.

The idle timeout is 30 minutes and the absolute lifetime is 12 hours. Resolution
updates `last_seen_at` and idle expiry at most once every five minutes. Each user
may have ten active sessions; creating an eleventh revokes the oldest.

Rotation has no overlap window. The prior token fails as soon as the transaction
commits. Login, password change, tenant selection, support entry, and support
exit rotate the token.

## 8. Lifecycle And State Transitions

| State                          | Action                                     | Result                                           |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------ |
| Verified login                 | Create                                     | Active normal or restricted session              |
| Active session                 | Resolve                                    | Authenticated context and bounded idle extension |
| Active session                 | Rotate                                     | New token; prior token invalid                   |
| Active session                 | Revoke or logout                           | Archived session and cleared cookie              |
| Idle or absolute limit reached | Resolve                                    | Archive and reject session                       |
| Restricted session             | Any route except password change or logout | Reject                                           |

## 9. Data Requirements

This Work Unit uses `admin.sessions`. M0001-00 defines its schema and token-hash
lookup. Soft-deleted session records are not purged automatically.

## 10. API Requirements

| Method and route                            | Authority                                  | Result                                        |
| ------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| `GET /api/admin-tenancy/v1/session/current` | Valid session                              | Safe session view                             |
| `POST /api/admin-tenancy/v1/session/rotate` | Current session                            | Rotated cookie and safe session view          |
| `POST /api/admin-tenancy/v1/auth/logout`    | Presented cookie, valid or expired         | Revoked reference and cleared cookie          |
| `DELETE /api/admin-tenancy/v1/sessions/:id` | Own session or permitted platform operator | `204`; repeated revocation also returns `204` |

The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, has no `Domain`, and is
`Secure` outside local development. Its maximum age never exceeds absolute
expiry. `SameSite=None` is not supported. State-changing session routes,
including bodyless logout, follow the
[BFF browser request protection](../../../architecture/bff.md#browser-request-protection)
contract. Responses never contain the token or token hash.

## 11. Cross-Module Interactions

WU 3 supplies authentication and password changes. WU 9 owns selected-tenant
and support context. Account disable or archive revokes all sessions. Membership
removal revokes sessions currently selecting that tenant. Platform-role removal
invalidates cached authority immediately and ends affected support sessions.

## 12. Security And Audit

- M0001-04-R008: Session tokens and token hashes must not appear in responses, logs, or events.
- M0001-04-R009: State-changing session routes must enforce BFF browser request protection; production configuration must reject `SameSite=None` and insecure session cookies.

Creation, rotation, revocation, expiry detected during resolution, and support
context changes create managed events with session UUIDs only.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                                           | Requirements                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | Eligible authentication creates a session for the correct user.                                                                                                                                           | M0001-04-R001                |
| AC02      | Valid sessions resolve; tampered, expired, archived, and revoked sessions do not.                                                                                                                         | M0001-04-R002, M0001-04-R004 |
| AC03      | Rotation immediately invalidates the prior token and concurrent attempts produce one winner.                                                                                                              | M0001-04-R003, M0001-04-R006 |
| AC04      | Idle and absolute limits, ten-session cap, logout, and repeated revocation follow this contract.                                                                                                          | M0001-04-R003                |
| AC05      | WU 9 context survives ordinary resolution and changes only through its operations.                                                                                                                        | M0001-04-R005                |
| AC06      | No response, log, or event exposes session credentials.                                                                                                                                                   | M0001-04-R008                |
| AC07      | Support can revoke platform and non-Napsoft sessions but cannot access Napsoft tenant sessions.                                                                                                           | M0001-04-R007                |
| AC08      | Same-origin session changes pass request protection; foreign or unproven origins cannot rotate or revoke sessions, including through bodyless logout; unsafe production cookie configuration is rejected. | M0001-04-R009                |

### Verification Evidence

Local validation on 2026-09-20: `npm run lint`, `npm run format:check`,
`npm test` (249 tests across the workspace, including 31 new unit tests),
`npm run build`, `npm run licenses`, and `git diff --check` passed.

`npm run test:db` passed 63 of 65 tests against a disposable PostgreSQL 18
server, including all 25
[session tests](../../../../apps/api/tests/integration/session-management.test.js).
The two failures are in `admin-foundation.test.js` and predate this Work Unit:
the local fixture server authenticates with `trust`, so the wrong-password
cases those tests rely on still connect. Neither touches `admin.sessions`.

Integration tests cover creation and its rollback with the caller's
transaction, the ten-session cap and its exclusion of idle-expired sessions,
resolution of live and restricted sessions,
rejection of unknown, tampered, expired, archived, and revoked tokens, the
idle and absolute limits, bounded `last_seen_at` refresh, rotation with a
single winner among five concurrent attempts, preserved tenant and support
context, logout idempotence, self and operator revocation including the
Napsoft denial, bulk revocation for a password change, and an event stream
holding no token or token hash.

Unit tests cover token shape and hashing, policy and authority validation, the
safe view, the error envelope, the route registry, and the routes themselves
against an in-memory admin handle: origin acceptance and every refusal, the
`Referer` fallback, bodyless logout, cookie attributes and maximum age,
restricted-session confinement, and the configuration rules that reject
`SameSite=None`, insecure production cookies, a weak secret, and a plaintext
production origin.

Rotation replaces a session's token hash and keeps its identifier, so its
revision key, event history, and WU 9 context survive it. One caller wins a
concurrent rotation because the update matches on the current hash: the second
transaction blocks, re-reads the committed row, and matches nothing.

`admin.sessions` has no restricted-session column. Resolution joins
`admin.portal_users` and derives `restricted` from `must_change_password`, so
clearing the flag in M0001-03 releases the session without a second rotation.

Two parts of Section 10 are not yet reachable over HTTP. `DELETE /sessions/:id`
passes no operator scope, so it revokes only the caller's own session;
`revokeSession` takes the scope and enforces M0001-04-R007 against it, which
the integration tests exercise, and M0001-05 supplies it from the caller's
platform roles. Nothing creates a session over HTTP until M0001-03 adds login,
which calls `createSession` inside its own transaction.

## 14. Outstanding Questions

None.
