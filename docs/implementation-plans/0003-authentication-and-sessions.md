# Authentication and sessions implementation plan

## Features already implemented

Delivered by earlier platform capabilities. This plan reuses them and does not
recreate them.

- The admin and cell database handles, the admin module registry, the
  migration runner, and the `db:migrate:admin` script.
- `createRouter`, the route registry, the four session gates,
  `rejectTenantInput`, `validateBody`, `sendContract`, and the SQLSTATE
  mapping.
- The success and error envelopes, the error-code registry, and
  `requestContract` on the web client.
- `util/requestContext.ts`, correlation, request logging, and the boundary
  error handler.
- The `.env` loader, the disposable PostgreSQL fixture, and the workspace
  import-boundary test.
- The theme, route-level loading and error boundaries, and the holding page.

## Work checklist

- [ ] Amend the specification, record ADR 0004, write PRD 0003, update the
      roadmap and this plan (this design pull request).
- [ ] Data: the `admin-tenancy` module with its descriptor, five tables,
      migrations, repositories, and the bootstrap seed.
- [ ] Service and routes: the session service, the actor resolver, the
      resolving middleware, the auth router, and the shared contracts.
- [ ] Web: `auth/`, `/login`, `/account`, and the redirects.
- [ ] Verify, then reconcile the roadmap, the changelog, PRD 0003, and this
      plan.

## Outcome and accepted design

Implement [PRD 0003](../PRDs/0003-authentication-and-sessions.md), the
requirements `AUTH-001` to `AUTH-009`, under
[ADR 0004](../ADRs/0004-seeded-root-identity.md) and the amended `ARCH-040`
and framework HTTP contract. The plan is required because the capability
establishes the authentication boundary and stores credentials. The owner
accepted the design on 2026-09-07; implementation starts with the data pull
request.

## Work and PR sequence

Four pull requests. The first is documentation only. Each of the remaining
three keeps every intermediate merge deployable: no route is reachable until
the third, and the web flows arrive in the fourth. Commit, push, PR creation,
and merge each require separate authorization.

The framework changes the 2026-09-07 amendment requires (admin-targeted
routers and declared route access) landed with the amendment in the design
pull request, under the Framework HTTP surface
[plan](framework-http-surface.md), not as part of this capability.

1. **Design.** This plan, PRD 0003, ADR 0004, the ADR index, the
   specification amendments, the documentation index, and the roadmap.
2. **Data.** `modules/admin-tenancy/` with `descriptor.ts` targeting `admin`
   and schema `admin`; `TableSchema` definitions and models for `tenants`,
   `portal_users`, `portal_user_tenants`, `sessions`, and `login_throttles`;
   one migration per table, including the root-row guard trigger and the
   partial unique indexes; the repositories file; registration in the admin
   module registry; `util/password.ts` wrapping Argon2id with the configured
   parameters; and `scripts/bootstrap.ts` behind the existing `db:bootstrap`
   script with its `--reset-root-password` flag. `.env.example` promotes the
   Argon2 and `ROOT_*` names. Nothing reads the tables at request time yet.
3. **Service and routes.** `services/sessions.ts` (create, resolve, touch,
   revoke, revoke others) and `services/loginThrottle.ts`; the actor field in
   the request context and the `pg-schemata` actor resolver registered at
   startup; `middleware/resolveSession.ts` installed after correlation on
   every request; `modules/admin-tenancy/apiRoutes/v1/auth.ts`
   with the four routes; `transport/auth.ts` and `THROTTLED` in
   `@nap/shared`; `.env.example` promotes the session, cookie, throttle, and
   proxy names.
4. **Web.** `auth/` with the session store, `useSession`, the
   authenticated-route gate, and login and password form behavior;
   `pages/LoginPage.tsx` and `pages/AccountPage.tsx`; the routes and
   redirects in `routes.ts`; and `api/auth.ts` calling the four contracts
   through `requestContract`.

## Verification and evidence

Unit tests cover password hashing bounds, cookie signing and tampering, the
throttle window arithmetic, the seed's argument and placeholder handling, and
the `next` path restriction. Integration tests against disposable PostgreSQL 18
drive the seed twice and assert one tenant, one root, one membership, and an
unchanged hash; run the reset flag and assert a new hash and revoked sessions;
attempt to lock, deactivate, demote, and re-address root and assert refusal;
log in with every failing combination and assert `UNAUTHENTICATED`; log in
successfully and assert the cookie attributes and the session view; replay a
tampered, expired, idle, revoked, and logged-out cookie; exhaust the throttle
and assert `THROTTLED` before hash evaluation and release after the window;
change the password and assert other sessions revoked; assert `created_by` on
a row written inside a resolved request; and send tenant values in headers,
query, route parameters, and body to every auth route and to a fixture
framework route with a real session. Conformance tests prove no file under
`services/` or `middleware/` imports `modules/` and that only the auth router
declares route access. Web tests cover the login form states, both redirects,
`next` handling, the account page, and the password change states. Run
focused tests first, then `lint`, `typecheck`, `test`, `build`,
`format:check`, and `licenses` on the pinned Node. The roadmap records actual
evidence; Verified requires merged, passing delivery.

## Defaults, rollout, and recovery

The data pull request adds admin tables and a seed that only the operator runs;
deploying it changes no endpoint. The service pull request installs the
resolver and the auth router; every other framework route still answers
`UNAUTHENTICATED` or `FORBIDDEN` because entitlements are empty. Rollback
restores the previous artifact; the tables are additive and can stay. Root
password recovery is `db:bootstrap --reset-root-password` with a new
`ROOT_PASSWORD`. Rotating `SESSION_SECRET` invalidates every cookie and forces
re-login; rotating `AUTH_THROTTLE_SECRET` resets throttle state. No feature
gates or ordered release units.
