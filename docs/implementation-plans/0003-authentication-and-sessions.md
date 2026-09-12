# Authentication and sessions implementation plan

## Features

- [x] Five admin tables, migrations, and repositories.
- [x] Idempotent root bootstrap and explicit password recovery.
- [x] Login/logout with signed cookies and database-backed sessions.
- [x] Idle/absolute expiry and immediate session revocation.
- [x] Email/address login throttling.
- [x] Password changes and request-scoped audit actors.
- [x] Login/account pages with redirects and loading/error states.
- [x] Corrected documents, security tests, and repository validation.

## Accepted design and delivery

Implement [PRD 0003](../PRDs/0003-authentication-and-sessions.md), AUTH-001
through AUTH-009, using ADR 0004 and the owner-approved audit exception in
[ADR 0005](../ADRs/0005-anonymous-login-throttle-actors.md). The original design
work is complete. This task delivers the remaining capability together in the
working tree; the former data/service/web pull-request split no longer applies.
Commit, push, PR creation, merge, and deployment require separate authorization.

## Implementation sequence

1. Correct the specification, ADR index, PRD, and this feature-first plan.
2. Register the admin-tenancy tables and frozen migrations, their TableModel
   repositories, Argon2id password helpers, and transactional bootstrap/reset.
3. Implement PostgreSQL session resolution and HMAC-keyed throttling, the actor
   resolver, shared contracts, resolving middleware, and factory-generated auth
   routes. Invalid-cookie failures resolve anonymously; database errors propagate.
   Failed-attempt counters must commit before the login refusal is sent, while
   all ordinary operation failures retain framework rollback behavior.
4. Add web auth state, login/account forms, safe next paths, and redirects using
   requestContract and existing branding and route boundaries.
5. Run focused security and UI tests, then all repository checks; reconcile PRD,
   roadmap, configuration guidance, and changelog against the actual evidence.

## Validation

Disposable PostgreSQL tests cover fresh and repeated migrations, seed/reset,
root guards, actor attribution, all identity/membership/tenant denials, signed
cookie tampering, expiry/revocation, password-change atomicity, concurrent
throttling and persisted failures, proxy trust, and tenant-input rejection with
real sessions. Conformance tests retain import and route-access restrictions.
Web tests cover forms, redirect safety, loading, expired sessions, and API/network
failures. Run lint, typecheck, tests, build, format:check, licenses, and diff check.
Implemented requires passing local checks; Verified requires merge and CI evidence.

## Current evidence

The merged implementation uses published pg-schemata 3.1.1 with an explicitly named
`{ expression: 'lower(email)' }` index in the portal-user model and frozen
migration. The dependency blocker is resolved.

All 263 repository tests pass against the installed lockfile (28 toolchain,
189 API, 33 web, 13 shared), including all 24 authentication integration tests
using disposable databases. Lint, typecheck, build, formatting, license checks,
and diff checking pass. This capability is Verified: [PR #14](https://github.com/silverstone-i/nap/pull/14) merged with passing CI.

## Rollout, defaults, and recovery

Deploy additive admin migrations, then explicitly run db:bootstrap. Runtime never
migrates or seeds. Rollback restores the prior artifact and leaves additive tables.
Root recovery uses --reset-root-password and revokes existing sessions. Rotation of
SESSION_SECRET invalidates cookies; rotation of AUTH_THROTTLE_SECRET resets keys.
Use the accepted session, cookie, proxy, throttle, and Argon2 configuration defaults.
Real environment values remain untouched. PRD 0004 brings forward tenant switching, provisioning and central permissions.
Business RBAC, Redis and forgotten-password email retain their later gates.

Authentication verification refreshed 2026-09-08: 263 tests and all repository checks passed.
[PR #14](https://github.com/silverstone-i/nap/pull/14) merged; [CI](https://github.com/silverstone-i/nap/actions/runs/34180826031) passed.
PRD 0004 extends AUTH-001/003/006/009 with restricted sessions, selection and onboarding.

Configuration note, 2026-09-12: ADR 0012 supersedes unsuffixed environment-sensitive settings in this historical delivery record. The current variable inventory is apps/api/.env.example.
