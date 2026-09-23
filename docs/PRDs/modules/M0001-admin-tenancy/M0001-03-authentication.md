# M0001-03: Authentication

## 1. Document Control

| Field                | Value                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                                        |
| Type                 | Module Work Unit                                                                                                                                   |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                  |
| Related architecture | [BFF](../../../architecture/bff.md)                                                                                                                |
| Related PRDs         | [M0001-01](M0001-01-tenant-and-portal-user-access.md), [M0001-04](M0001-04-session-management.md), [W0005](../../workflows/W0005-portal-access.md) |
| Related decisions    | None                                                                                                                                               |
| Last reviewed        | 2026-09-20                                                                                                                                         |

## 2. Purpose

Verify portal-user passwords, require replacement of temporary passwords, and
slow repeated login attacks.

## 3. Scope

### Included

- Password hashing and verification.
- Login throttling by account and client address.
- Required password replacement.

### Excluded

- Session persistence and cookies.
- Password-reset and account-recovery workflows.
- Portal-user administration.

## 4. Actors And Permissions

| Actor                         | Operation                                                  | Result                                     |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| Anonymous caller              | Submit login credentials                                   | Authenticate, reject, or throttle          |
| Authenticated user            | Prove current password and supply replacement              | Replace password and revoke other sessions |
| Password-change-required user | Replace temporary password                                 | Continue with a normal session             |
| Operator                      | Set a temporary password when creating a user through WU 8 | Force replacement on next login            |

## 5. Concepts And Terminology

| Term               | Meaning                                                |
| ------------------ | ------------------------------------------------------ |
| Password hash      | Argon2id output stored instead of the password         |
| Restricted session | Session allowed to change the password or log out only |
| Throttle key       | HMAC of normalized account input or client address     |

## 6. Functional Requirements

- M0001-03-R001: Login must verify the supplied password against the stored Argon2id hash using the authentication-only credential lookup.
- M0001-03-R002: `must_change_password` must restrict the session until a valid replacement password is stored.
- M0001-03-R003: Failed login attempts must update and enforce persistent account and client-address throttle windows atomically.
- M0001-03-R004: Unknown, locked, disabled, archived, or invalid accounts must not create an ordinary session.

## 7. Business Rules And Invariants

- M0001-03-R005: Plaintext passwords and password hashes must not appear in ordinary reads, responses, logs, or events.
- M0001-03-R006: Password replacement and `must_change_password = false` must commit together; failure preserves the old hash and flag.

Use Argon2id with at least 19 MiB memory, two iterations, one lane, and a unique
salt. Passwords must contain 12–128 Unicode characters. Rehash after successful
login when configured parameters increase.

Login evaluates account and client-address keys. Five failures in 15 minutes
lock that key for 15 minutes. A successful login clears the account key. Unknown
accounts run one dummy Argon2id verification to avoid account-discovery timing.
Expired throttle rows may be deleted after 24 hours.

### Amendments From W0005

These rules take effect when [W0005: Portal Access](../../workflows/W0005-portal-access.md) is implemented; until then the rules above apply.

- Amended by W0005 (W0005-R004): a login's first password change moves every `pending` membership of that login to `active`.
- Amended by W0005 (W0005-R010): a Napsoft password reset sets a temporary password and `must_change_password = true` and does not change membership status.
- Amended by W0005 (W0005-R013): root, `platform_admin`, and `support` can unlock a `locked` login; `support` cannot unlock a Napsoft member.

## 8. Lifecycle And State Transitions

| Condition                                    | Action          | Result                                         |
| -------------------------------------------- | --------------- | ---------------------------------------------- |
| Active account, valid password               | Login           | Normal session                                 |
| Active account, valid temporary password     | Login           | Restricted session                             |
| Invalid credentials                          | Login           | Generic rejection and throttle update          |
| Locked throttle key                          | Login           | `THROTTLED` without authentication             |
| Valid current password and valid replacement | Change password | New hash, cleared flag, other sessions revoked |

## 9. Data Requirements

This Work Unit uses `admin.portal_users` and `admin.login_throttles`. M0001-00
defines their schema and credential-specific model methods.

## 10. API Requirements

| Method and route                           | Request                            | Success                       | Failure                                                        |
| ------------------------------------------ | ---------------------------------- | ----------------------------- | -------------------------------------------------------------- |
| `POST /api/admin-tenancy/v1/auth/login`    | `{ email, password }`              | `200` session view and cookie | `401 UNAUTHENTICATED` or `429 THROTTLED`                       |
| `POST /api/admin-tenancy/v1/auth/password` | `{ currentPassword, newPassword }` | `200` with no secret data     | `400 INVALID_INPUT`, `401 UNAUTHENTICATED`, or `403 FORBIDDEN` |

Login failures use the same public message. `THROTTLED` includes `Retry-After`.
Password change requires a valid session. Login and password change follow the
[BFF browser request protection](../../../architecture/bff.md#browser-request-protection)
contract.

## 11. Cross-Module Interactions

M0001-04 creates and revokes sessions. Password changes revoke every other
session. Disabling or archiving an account causes all its sessions to fail
resolution and be revoked by WU 8.

## 12. Security And Audit

- M0001-03-R007: Login and password change must enforce the BFF browser request protection contract before authentication or credential mutation.

Record login success, login failure, throttling, and password change without
the password, hash, raw email, or raw client address. Failure events use the
request ID and hashed throttle key.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                                                  | Requirements                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | Valid active credentials authenticate; all ineligible or invalid cases receive the generic rejection.                                                                                                            | M0001-03-R001, M0001-03-R004 |
| AC02      | Temporary-password login permits only password replacement and logout.                                                                                                                                           | M0001-03-R002                |
| AC03      | Concurrent failures enforce both throttle keys and the stated window.                                                                                                                                            | M0001-03-R003                |
| AC04      | Password replacement is atomic and revokes every other session.                                                                                                                                                  | M0001-03-R006                |
| AC05      | Responses, logs, and events contain no plaintext password, hash, raw email, or raw client address.                                                                                                               | M0001-03-R005                |
| AC06      | Same-origin login and password change pass request protection; foreign, null, and missing-origin requests follow the BFF rejection and Referer-fallback rules without changing credentials or creating sessions. | M0001-03-R007                |

### Verification Evidence

Local validation on 2026-09-20: `npm run lint`, `npm run format:check`,
`npm test` (298 tests across the workspace, including 49 new unit tests),
`npm run build`, and `npm run licenses` passed.

`npm run test:db` passed 83 of 85 tests against a disposable PostgreSQL 18
server, including all 20
[authentication tests](../../../../apps/api/tests/integration/authentication.test.js).
The two failures are in `admin-foundation.test.js` and predate this Work Unit:
the local fixture server authenticates with `trust`, so the wrong-password
cases those tests rely on still connect. Neither touches `admin.portal_users`
or `admin.login_throttles`.

Integration tests cover authentication and its throttle together: successful
login for an eligible account, a restricted session for a temporary password,
the same `UNAUTHENTICATED` rejection for a wrong password, an unknown or
unparseable account, and a locked, disabled, or archived account, none of
which leaves a session row behind. They cover the throttle window on its own:
the fifth failure locking a key for fifteen minutes; the sixth refused without
a verification; the window restarting once it elapses; a key not re-locking on
the single attempt after its lock expires; five concurrent failures against
one account recording exactly five; the account and client-address dimensions
enforced independently, including five failures from one address against five
different accounts locking only the address; a successful login clearing the
account key and leaving the address key; and `purgeExpired` removing a stale
row while keeping a live lock. They cover the post-login rehash raising a
stored digest's parameters and leaving a stronger one alone under a weaker
configuration. They cover password change: the hash, the cleared flag, every
other session's revocation, and this session's rotation committing together;
a wrong current password, a too-short or repeated replacement, and an account
disabled between session resolution and the change each leaving the old hash
in place; and an injected event-append failure rolling the hash, the flag, the
revocation, and the rotation all back together. A final scan of every event
recorded across the run finds no password, hash fragment, raw email, or raw
client address.

Unit tests cover the password policy at the Unicode boundary — an emoji
password satisfies twelve characters by code point, not by UTF-16 length — the
Argon2id floor, hashing and verification including a malformed stored digest
reported as a mismatch rather than an error, the rehash rule firing only on an
increase, throttle-key derivation and normalization, and the routes
themselves against an in-memory admin handle: successful login and its
cookie; every ineligible and invalid login case answering with the same
envelope; a locked account's `429` and `Retry-After`; a restricted session
confined to password change and logout; password change's rotation and
event; browser request protection on both new routes across the standard nine
header cases; and configuration rules that reject a short or placeholder
throttle secret and an Argon2id parameter below the PRD floor.

Two design points worth recording. First, the digest parameter parser reads
`m`, `t`, and `p` by name rather than by position: the library writes them as
`m,p,t`, not the `m,t,p` order the RFC's own examples use, and matching a
fixed order would have read every digest this API writes as unparseable and
silently rehashed the whole table on each login. Second, the throttle's
`recordFailure` is a single `INSERT … ON CONFLICT DO UPDATE`, so PostgreSQL
decides the window, the lock, and the concurrency between two racing failures
in one statement, the same way `admin.sessions`' methods decide expiry — an
API process comparing timestamps client-side could not make M0001-03-R003's
atomicity claim hold under concurrent load.

## 14. Outstanding Questions

None.
