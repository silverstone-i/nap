# 0003 — Authentication and sessions

**Design:** Accepted (owner approved, 2026-09-07).
**Implementation:** Verified (PR #14 merged; required CI passed).

## Authority

Implements `ARCH-022`, `ARCH-023`, `ARCH-040`, `ARCH-044`, `ARCH-045`,
`ARCH-048`, and `ARCH-050` in the
[platform specification](../specs/nap-platform-specification.md). The
[technology stack](../specs/nap-platform-specification.md#technology-stack)
owns Argon2id and the `jose`-signed session cookie; the
[module ownership map](../specs/nap-platform-specification.md#module-ownership-map)
gives `admin-tenancy` the identities, credentials, sessions, login throttling,
and login routes; the
[framework HTTP contract](../specs/nap-platform-specification.md#framework-http-contract)
owns admin-targeted routers and declared route access; and
[web structure](../specs/nap-platform-specification.md#web-structure) owns
`auth/`. [ADR 0004](../ADRs/0004-seeded-root-identity.md) records the seeded
root identity.

This capability owns login, logout, session resolution, password change, login
throttling, the bootstrap seed, and the five tables below. PRD 0004 owns the added membership, selection, assignment and onboarding
behavior; forgotten-password delivery remains a later capability.

## Accepted behavior

- **AUTH-001 Login.** `POST /login` takes normalized `email` and `password`.
  Wrong credentials, locked identities and absence of eligible membership or
  central authorization answer `UNAUTHENTICATED` with the same credential work.
  PRD 0004 TEN-003 now owns single-membership selection, restricted multi-membership
  sessions and platform administration without an ordinary membership. Temporary
  credentials require password change before selection or tenant work.
- **AUTH-002 Session cookie.** The cookie is `HttpOnly`, `Secure` unless
  `COOKIE_SECURE=false`, `SameSite` from `COOKIE_SAMESITE` (default `lax`),
  path `/`, and holds a `jose`-signed compact token carrying the session
  identifier and a random secret. The database row stores only the SHA-256
  digest of the secret. The cookie is a reference: it carries no actor,
  tenant, role, or expiry that the server trusts.
- **AUTH-003 Session resolution.** A service under `services/` resolves every
  request that presents a cookie: verify the signature, load the session by
  identifier, compare the secret digest, and require the session unrevoked and
  inside both its idle and absolute expiry, the identity active, and any selected membership and tenant active. TEN-003
  additionally checks assignment, readiness, restrictions, and controlled access. Any failure resolves no session and the
  request continues as anonymous, so the framework gates answer as they do
  today. A resolved session stores the actor, the selected tenant when available, and resolved
  permission sets on the response until RBAC and module
  entitlement fill them, and extends the idle expiry.
- **AUTH-004 Expiry and revocation.** Idle expiry is `SESSION_IDLE_MINUTES`
  (default 30) after the last resolved request; absolute expiry is
  `SESSION_ABSOLUTE_HOURS` (default 12) after login. `POST /logout` revokes
  the presented session, clears the cookie, and answers success whether or
  not a session resolved. A revoked or expired session is refused on the next
  request; no decision is cached.
- **AUTH-005 Login throttling.** Failed logins are counted per normalized
  email and per client address, each keyed by an HMAC under
  `AUTH_THROTTLE_SECRET` so the table holds no raw email or address. Ten
  failures within fifteen minutes lock that key for fifteen minutes, and a
  throttled attempt answers `THROTTLED` (HTTP 429) before the password is
  evaluated. A successful login clears the email key. The client address is
  the socket address unless `TRUST_PROXY_HOPS` names how many trailing
  `X-Forwarded-For` hops to trust (default 0). Throttle writes follow
  AUTH-008's actor policy, including its specification-backed exception for
  writes before an identity is authenticated.
- **AUTH-006 Password change.** `PUT /password` requires a session, the
  current password, and a new password of 12 to 128 characters with no other
  composition rule. It rehashes with the configured Argon2id parameters and
  revokes every other session of the identity. TEN-006 clears the mandatory
  password-change restriction after success; impersonated sessions cannot change credentials. The root identity changes its
  password only this way or through the seed's reset flag.
- **AUTH-007 Seeded root identity.** `npm run db:bootstrap` reads
  `ROOT_TENANT_CODE`, `ROOT_COMPANY`, `ROOT_EMAIL`, and `ROOT_PASSWORD`,
  refuses a placeholder or short password, and inserts the operator tenant
  (status `active`), the root identity (`is_root`), and the membership
  between them when each is absent. It writes the password only when it
  creates the identity. `--reset-root-password` rehashes the root password
  from `ROOT_PASSWORD` and revokes root's sessions; it is the operator's
  recovery path. Seeded rows carry null actors. The root identity's email is
  immutable, and no route may lock, deactivate, or demote it. The script logs
  no configured value.
- **AUTH-008 Actor resolution.** The request context carries the resolved
  actor, and the application registers one `pg-schemata` actor resolver at
  startup that reads it, so `created_by` and `updated_by` hold the identity
  id without being threaded through signatures. Scripts supply an explicit
  service actor or, for the seed, none. For anonymous writes to
  `admin.login_throttles`, `created_by` and `updated_by` may be null under
  the [specification exception](../specs/nap-platform-specification.md#database-record-conventions)
  recorded in [ADR 0005](../ADRs/0005-anonymous-login-throttle-actors.md);
  authenticated writes retain their resolved actor.
- **AUTH-009 Web flows.** `/login` renders email and password fields, a
  visible message for `UNAUTHENTICATED` and `THROTTLED`, a loading state, and
  honors `?next=<encoded path>` restricted to same-origin paths. `/account`
  shows the signed-in email and tenant, a logout action, and a password
  change form with its success and failure states. An unauthenticated visit
  to `/account` redirects to `/login?next=%2Faccount`; a signed-in visit to
  `/login` redirects to `/account`. `auth/` owns session state loaded from
  `GET /session`, and every reply is validated with `requestContract`. PRD 0004 adds tenant selection and operator navigation without a business shell.

## Data

All tables live in the admin database, schema `admin`, are owned by
`admin-tenancy`, use the Central mutable profile, and carry the standard
columns unless a departure is named.

| Table                 | Columns beyond the standard set                                                                                                                                                         | Constraints and departures                                                                                                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenants`             | `tenant_code varchar(16)`, `company varchar(128)`, `status text` in `pending`, `active`, `suspended`                                                                                    | Unique active `tenant_code`. PRD 0004 owns additive assignment, tier, provisioning and revision columns                                                                                                                                                                          |
| `portal_users`        | `email varchar(128)`, `password_hash text`, `status text` in `active`, `locked`, `is_root boolean default false`                                                                        | Unique active `lower(email)`; partial unique index on `is_root` where true, so at most one root exists; the migration-owned trigger rejects changing the root row's `email`, `status`, `is_root`, or `deactivated_at`                                                            |
| `portal_user_tenants` | `portal_user_id uuid` FK `portal_users`, `tenant_id uuid` FK `tenants`, `status text` in `active`, `locked`                                                                             | Unique active `(portal_user_id, tenant_id)`; both FKs indexed, `ON DELETE RESTRICT`; PRD 0004 owns the additional type, record, readiness and revision columns                                                                                                                   |
| `sessions`            | `portal_user_id uuid` FK `portal_users`, `tenant_id uuid` FK `tenants`, `token_hash text`, `idle_expires_at timestamptz`, `absolute_expires_at timestamptz`, `last_seen_at timestamptz` | Unique `token_hash`; FKs indexed, `ON DELETE RESTRICT`; `deactivated_at` is the revocation timestamp; rows are never hard-deleted in this release                                                                                                                                |
| `login_throttles`     | `key_hash text`, `failures integer`, `window_started_at timestamptz`, `locked_until timestamptz`                                                                                        | Unique `key_hash`. Anonymous audit actors follow the specification exception (ADR 0005). Departure: a row whose window and lock have both passed is hard-deleted by the throttle service on the next write to that key, because it is transient control state holding no history |

Authentication itself creates no cell projection. PRD 0004 owns the
cell-tenancy projection design and implementation brought forward for provisioning.

## API

The route registry mounts one admin-targeted router at
`/api/admin-tenancy/v1/auth`, with every standard route disabled and the original four
routes below added through the extension callback. Request and response
contracts are Zod schemas in `@nap/shared` under `transport/auth.ts`, and the
error-code registry gains `THROTTLED`. `rejectTenantInput` stays on every
route.

| Method and path | Access        | Request                            | Success               |
| --------------- | ------------- | ---------------------------------- | --------------------- |
| `POST /login`   | anonymous     | `{ email, password }`              | 200, session view     |
| `POST /logout`  | anonymous     | none                               | 200, `data` is `null` |
| `GET /session`  | authenticated | none                               | 200, session view     |
| `PUT /password` | authenticated | `{ currentPassword, newPassword }` | 200, `data` is `null` |

The session view is defined by `transport/auth.ts` in @nap/shared. PRD 0004
extends it with restricted states, nullable selection, central permissions and
controlled-access display context. `expiresAt` remains the sooner deadline.

## Configuration

The API reads `SESSION_SECRET` (replacing the proposed `ACCESS_TOKEN_SECRET`),
`AUTH_THROTTLE_SECRET`, `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_HOURS`,
`COOKIE_SECURE`, `COOKIE_SAMESITE`, `TRUST_PROXY_HOPS`, `ARGON2_MEMORY_KIB`,
`ARGON2_TIME_COST`, and `ARGON2_PARALLELISM`; the seed reads the four `ROOT_*`
values. Startup refuses a missing or placeholder `SESSION_SECRET` or
`AUTH_THROTTLE_SECRET`. Argon2id defaults are 19456 KiB, time cost 2, and parallelism 1. Accepted
configuration bounds are 19456–1048576 KiB, time cost 2–20, parallelism 1–16,
idle minutes 1–1440, and absolute hours 1–8760. Secrets require at least 32
characters. SameSite `none` requires secure cookies. The admin migration script
grants `ADMIN_RUNTIME_ROLE` (default `nap_app`) schema usage and select/insert/update
on these five tables, with delete access only on `login_throttles`.

The implementation promotes these names in
`.env.example` from proposed to implemented.

## Boundaries and interfaces

- Session resolution and the actor resolver are services and import no module
  (`ARCH-048`); the framework gates are unchanged.
- PRD 0004 adds explicit central permissions and the bounded Core self-read
  permission. General tenant business RBAC remains deferred.
- No email is sent. Forgotten-password reset waits for the capability that
  introduces email delivery; until then the seed's reset flag recovers root,
  Ordinary identity onboarding now follows PRD 0004.
- Redis is not used; every session decision reads PostgreSQL.
- Diagnostic logs never carry an email, password, hash, cookie, token, or
  throttle key. A login failure logs an event name and the correlation
  identifier only.

## Acceptance evidence

Tests cover every AUTH requirement: correct and wrong credentials answering
alike; locked identity, locked membership, and suspended tenant; zero and two
memberships; cookie tampering of signature, identifier, and secret; idle and
absolute expiry; revocation on logout and on password change; throttle lock,
release, and reset; seed idempotence, placeholder refusal, an existing password
never rewritten, and the reset flag; the root immutability guards; actor ids
landing in `created_by` and `updated_by`; tenant input rejected on every auth
route and on a fixture framework route with a real session; the `ARCH-048` and
`ARCH-050` conformance tests; and the web login, redirect, `next`, account,
password change, loading, and error states. Repository checks pass before
Implemented. Verified requires merged code, passing CI, and roadmap
reconciliation.

## Revisions

| Date       | Change                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-07 | Drafted from the roadmap's Authentication and sessions entry and ADR 0004.                                                        |
| 2026-09-07 | Accepted by the owner.                                                                                                            |
| 2026-09-08 | Recorded the owner-approved anonymous throttle actor exception, configuration bounds, and runtime grants; implementation started. |
| 2026-09-08 | Linked AUTH-005 to AUTH-008 and named the nullable audit columns explicitly to clarify pre-authentication throttle writes.        |
| 2026-09-08 | Updated to pg-schemata 3.1.1 and verified all local checks; implementation complete, merge and CI pending.                        |
| 2026-09-08 | Verified merged PR #14 and passing CI; linked intentional session/onboarding extensions to PRD 0004.                              |

Authentication verification refreshed 2026-09-08: 263 tests and all repository checks passed.
[PR #14](https://github.com/silverstone-i/nap/pull/14) merged; [CI](https://github.com/silverstone-i/nap/actions/runs/34180826031) passed.
PRD 0004 extends AUTH-001/003/006/009 with restricted sessions, selection and onboarding.

## Multi-cell authentication amendment

Login evaluates all centrally eligible memberships. Session and password actions
are central and selection validates the assigned active cell without requiring
it to be the receiving deployment. A cell-data request still requires a local
assignment. See PRD 0004 TEN-008 and ADR 0007; cookie rotation and expiry are unchanged.

| Date       | Change                                                       |
| ---------- | ------------------------------------------------------------ |
| 2026-09-08 | Accepted central authentication across cells under ADR 0007. |

Multi-cell amendment: Verified upon merge of [PR #17](https://github.com/silverstone-i/nap/pull/17) with required checks passing. [CI on the reviewed implementation](https://github.com/silverstone-i/nap/actions/runs/34314494340) passed; required CI must also pass on the final PR head.
