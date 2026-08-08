# 0014 — Session tokens and lifetimes

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

ADR-0004 fixed the token claims (`sub` + `ph`) and ADR-0012 fixed the
staleness flow (`X-Token-Stale` drives a refresh), but neither says
what issues the token, how long it lives, or when a session ends. The
requirements: sessions stay alive while the user works, end after a
user-chosen idle window, end unconditionally after an admin-chosen
absolute lifetime, and the client can warn before an idle logout.

## Decision

1. **Login issues two httpOnly cookies: a short-lived access JSON Web
   Token (JWT) and an opaque refresh token.** The access token carries
   `sub` + `ph` (ADR-0004) and lives 15 minutes. The refresh token is
   a random opaque value; all session state lives server side.
2. **Session truth is Postgres, in `admin.sessions`.** One row per
   session: the refresh token hash, the portal user, `created_at` (the
   absolute anchor), and the sliding idle expiry. Sessions are state,
   not cache, so they follow ADR-0012's "truth is Postgres" rule
   rather than its Redis-cache pattern — losing a session row ends the
   session (fail closed), unlike the fail-open canon and active-tenant
   keys.
3. **Refresh rotates the token.** Each refresh call validates the
   presented token against the stored hash, issues a new pair, and
   replaces the hash. A refresh presenting an already-rotated token is
   theft evidence: the session is revoked.
4. **The idle timeout is the refresh token's sliding expiry.** Each
   accepted refresh moves the idle expiry forward by the user's idle
   window. The window is user-selectable from 30, 60, 90, or 120
   minutes, clamped to the tenant's configured bounds.
5. **The absolute lifetime is admin policy, never user preference.**
   Refresh is refused once `now() - created_at` exceeds the tenant's
   absolute session lifetime (default 12 hours), regardless of
   activity. A user who could extend their own forced logout would
   make the control meaningless.
6. **Activity is client input, never application programming interface
   (API) traffic.** The client requests a refresh only when the user
   has produced input events (keyboard, pointer, touch) since the last
   refresh. Background traffic — autosave writes (ADR-0016), polling —
   never extends a session. With no input, the client stops
   refreshing, the access token lapses, and the idle expiry passes.
7. **For users with several active tenant bindings, the effective
   policy is the most restrictive across those tenants.** Employees
   and clients have one binding (ADR-0004), so this only affects
   vendor contacts: the tightest idle bounds and shortest absolute
   lifetime among their active tenants apply, and a tenant switch
   never changes the session policy mid-session.
8. **Policy lives on `admin.tenants`; the preference lives on
   `admin.portal_users`.** Tenants carry the idle-window bounds and
   the absolute lifetime; each user carries their chosen idle window.
9. **Session responses expose the expiry pair.** Login and refresh
   return `idle_expires_at` and `absolute_expires_at`, so the client
   drives the pre-logout warning from server truth instead of a local
   guess.

## Consequences

- A Redis outage does not end sessions; a Postgres session-row loss
  does, by design.
- The client is trusted to report activity honestly. A hostile client
  can refresh until the absolute lifetime — which is exactly why that
  bound is admin-owned and unconditional.
- Each active session costs one indexed `admin.sessions` lookup per
  refresh (at most every 15 minutes when idle windows are honored).
- Expired session rows accumulate and need periodic purging.
- Tightening a tenant's policy takes effect on each session at its
  next refresh, not instantly.

## Alternatives considered

**Stateless refresh JWT.** Rejected. Nothing server side means no
revocation: logout, theft response, and deactivation would all wait on
token expiry, and rotation-reuse detection is impossible.

**Sessions in Redis.** Rejected. A Redis restart would log every user
out. The fail-open rebuild that excuses Redis for caches (ADR-0012)
does not exist for sessions — there is nothing to rebuild from.

**Sliding expiry driven by request traffic.** Rejected. Continuous
persistence (ADR-0016) makes every open form a steady request stream;
traffic-based activity would keep an abandoned tab logged in until the
absolute cap, erasing the idle timeout.

**One long-lived access token, no refresh pair.** Rejected. A single
token must either be reissued on every request or checked against the
database on every request; the short-access/refresh split confines the
database touch to the refresh call and keeps ADR-0012's `ph` staleness
window at 15 minutes.
