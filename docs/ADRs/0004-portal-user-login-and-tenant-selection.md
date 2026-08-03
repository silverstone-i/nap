# 0004 — Portal user login and tenant selection

- **Status:** Accepted
- **Date:** 2026-08-02

## Context

Employees and clients reach exactly one tenant; vendor contacts reach
several with one login. [DESIGN.md](../architecture/DESIGN.md) fixes the
schema — `admin.portal_users` for identity, `admin.portal_user_tenants` for
membership — and defers the active-tenant resolution rule to this ADR
(§2.1, §3, §5.1).

## Decision

1. **Identity is global.** One `admin.portal_users` row per person, keyed
   on email.
2. **Membership is per binding row.** `entity_id` lives on
   `admin.portal_user_tenants` because the same person is a different
   entity record in each tenant.
3. **Employees and clients hold one active binding; vendor contacts hold
   many.** Enforced by a partial unique index on `(portal_user_id)` WHERE
   `deactivated_at IS NULL AND user_type IN ('employee','client')` (stated
   with the table in DESIGN.md §5.1).
4. **Login resolves the active tenant as the active binding with
   `MAX(last_used_at)` among bindings whose tenant is active.** Bindings in
   inactive or suspended tenants are skipped; login is refused only when no
   binding lands in an active tenant. New bindings default `last_used_at`
   to `now()`, so a fresh binding becomes the landing tenant.
5. **Login returns the active binding list** so the client can render a
   tenant picker. Only vendor contacts see more than one.
6. **The active tenant is stored server side in Redis**, in its own
   per-user key beside the permission canon (the canon key
   `perm:<userId>:<tenantCode>` embeds the tenant, so the active tenant
   cannot live inside it). The token stays `sub` + `ph`.
7. **Switching sends the tenant code on the switch call only**, not on
   every request. The server validates it against the user's active
   bindings, updates that binding's `last_used_at`, and updates the stored
   active tenant.
8. **If the Redis key is lost, fall back to the rule in point 4** —
   `MAX(last_used_at)` over active bindings in active tenants. Same
   fail-open pattern as the permission canon.

## Consequences

- Adding a vendor contact to a new tenant makes that tenant their landing
  page on next login (point 4's `now()` default).
- A tenant switch changes the permission canon, so the token's `ph` claim
  no longer matches; the existing `X-Token-Stale` response (DESIGN.md §3)
  drives the client to refresh. No new mechanism is needed.
- Suspending a tenant silently retargets its vendor contacts to their next
  most-recent active tenant instead of locking them out.
- Cross-tenant access for NAP staff and impersonation are separate
  concerns, out of scope for this ADR.

## Alternatives considered

**Oldest-active-binding landing rule.** Rejected. Landing in the
longest-held tenant makes a newly granted tenant invisible until the user
hunts for the picker; `MAX(last_used_at)` with a `now()` default surfaces
the new tenant immediately and thereafter follows actual use.

**Tenant claim in the token.** Rejected. DESIGN.md §3 fixes the claims at
`sub` + `ph`; embedding the tenant would force token reissue on every
switch and split the source of truth between cookie and server.

**Tenant code on every request.** Rejected. A per-request header makes
every client call carry tenant state and every endpoint validate it; a
switch-call-only contract keeps the tenant server side with one validation
point.
