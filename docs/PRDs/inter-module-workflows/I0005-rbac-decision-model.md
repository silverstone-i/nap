# I0005: RBAC Decision Model

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                 |
| Type                 | Inter-module workflow                                                                                                                                                                                                                                                                                                                 |
| Related architecture | [Module map](../../architecture/module-map.md), [Module design](../../architecture/module-design.md), [Admin and cells](../../architecture/admin-cells.md)                                                                                                                                                                            |
| Related PRDs         | [M0003: Access Control](../modules/M0003-access-control.md), [M0001-10: Module entitlements](../modules/M0001-admin-tenancy/M0001-10-module-entitlements.md), [M0001-11: Cache consistency](../modules/M0001-admin-tenancy/M0001-11-cache-consistency.md), [I0001: Application Entry and Shell](I0001-application-entry-and-shell.md) |
| Related decisions    | One capability check decides every request; the web app renders from the same answer                                                                                                                                                                                                                                                  |
| Last reviewed        | 2026-09-27                                                                                                                                                                                                                                                                                                                            |

## 2. Purpose

Decide whether a signed-in user may perform a route's action in a target
tenant. Role-based access control (RBAC) here is capability enforcement only:
a user's roles give capability patterns, a route requires one capability, and
the request runs only if a pattern matches.

## 3. Scope

### Included

- Reading a user's roles and grants from their own tenant's cell.
- Building a route's capability from the route and the target tenant.
- Pattern matching, including the Napsoft rule and entitlements.
- A startup check that every route declares a capability.
- 403 responses and denial events.
- Caching resolved patterns.
- A session capabilities endpoint and capability-based gating in the web app.

### Excluded

- Role, grant, and assignment storage and rules: M0003.
- Authentication and sessions: M0001.
- Support impersonation, tickets, and support logging: the future support module.

## 4. Actors And Permissions

| Actor                              | Result                                                   |
| ---------------------------------- | -------------------------------------------------------- |
| Signed-in user                     | Permit if a pattern from their home tenant roles matches |
| Signed-in user with no active role | Deny `NO_CAPABILITY`                                     |
| Inactive user or membership        | Deny `INACTIVE`                                          |
| Restricted session                 | Deny `RESTRICTED`                                        |

Example: Sam belongs to Napsoft and holds `support`. Reading Acme's payments
requires `ACME::payables::payments::read`, which `*::*::*::read` matches. The
same request for `NAP` does not match, because a tenant `*` excludes Napsoft.

## 5. Concepts And Terminology

| Term                | Meaning                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Home tenant         | Napsoft for an active Napsoft member; otherwise the target tenant, if the user is an active member of it; roles are read from its cell |
| Target tenant       | The tenant a request acts on; the session's selected tenant                                                                            |
| Route capability    | `module::router::action` a route declares                                                                                              |
| Required capability | Target tenant code prefixed to the route capability                                                                                    |
| Resolved set        | Union of grants from the user's active roles in the home tenant                                                                        |

## 6. Functional Requirements

- I0005-R001: Every protected route must declare its route capability with `requireCapability('module::router::action')` at registration. Routes must not check roles directly.
- I0005-R002: At startup, the API must refuse to start if a protected route declares no capability, declares one missing from its module descriptor, or uses `read` on a route that is not `GET`.
- I0005-R003: The required capability is the target tenant's code followed by the route capability. Records Napsoft manages about tenants (tenants, cells, entitlements, provisioning, and platform-level logins) use the Napsoft tenant's code as the target. That code comes from `ROOT_TENANT_CODE_<ENV>`; `NAP` in these documents is its example value.
- I0005-R004: The resolved set is read from the user's home tenant's cell (M0003). Archived roles, archived assignments, inactive users, and inactive memberships contribute nothing.
- I0005-R005: A pattern matches a required capability when each part is equal or `*`, with two rules:
  - a tenant `*` never matches the tenant with `is_napsoft = true`;
  - the target tenant must be entitled to the module (M0001-10), whatever the pattern says.
- I0005-R006: A decision returns `permit` or `deny` with a reason: `ROLE`, `NO_CAPABILITY`, `NOT_ENTITLED`, `INACTIVE`, or `RESTRICTED`.
- I0005-R007: A denied request returns HTTP 403 with the error envelope's `error` set to `{ code: 'FORBIDDEN', message, capability, reason }`. A denied write also writes an `access.denied` event (M0001-12); a denied read is logged only.
- I0005-R008: Resolved sets may be cached per user and home tenant. An assignment, role, or grant change (M0003-R015), a membership change, or an entitlement change must invalidate affected entries using M0001-11 revisions.
- I0005-R009: If the home tenant's cell cannot be reached, the request is denied. The decision never falls back to a cached set whose revisions cannot be checked.
- I0005-R010: `GET /api/admin-tenancy/v1/session/capabilities` must return the resolved set, the home tenant, the target tenant, and the Napsoft tenant, computed by the same code as R004–R005. The Napsoft tenant lets the web app apply the R005 tenant `*` rule and build `NAP` capabilities.
- I0005-R011: The web app must load R010 at shell entry and after tenant selection, and must:
  - hide navigation entries and routes whose capability does not match;
  - hide or disable actions whose capability does not match;
  - show a denied page for a direct URL the session cannot use;
  - show the 403 reason when the server denies an allowed-looking action, then reload capabilities.

## 7. Business Rules And Invariants

- The server decides; hiding something in the web app never grants or denies access.
- A user's roles always come from their home tenant, never from the target tenant.
- R005 is the only authority; no user or session bypasses it.
- An unknown capability, failed lookup, or unreachable cell denies.

## 8. Lifecycle And State Transitions

| Event                              | Result                                              |
| ---------------------------------- | --------------------------------------------------- |
| Role, grant, or assignment changes | Cached sets for that tenant refreshed               |
| Membership suspended               | User's roles contribute nothing                     |
| Entitlement removed                | Module capabilities stop matching for that tenant   |
| Tenant selected                    | Target tenant changes; web app reloads capabilities |

## 9. Data Requirements

None owned. Reads M0003 `app.roles`, `app.role_grants`, `app.role_assignments`
in the home tenant's cell, and admin sessions, memberships, tenants, and
entitlements.

## 10. API Requirements

| Method and route                                 | Capability            | Response                                                  |
| ------------------------------------------------ | --------------------- | --------------------------------------------------------- |
| `GET /api/admin-tenancy/v1/session/capabilities` | Authenticated session | `{ patterns[], homeTenant, targetTenant, napsoftTenant }` |

Every other route's capability is declared by its module (R001).

## 11. Cross-Module Interactions

- M0003 supplies roles, grants, and assignments.
- The I0003 runtime registry supplies the home tenant's cell connection.
- M0001-10 supplies entitlements; M0001-11 cache revisions; M0001-12 events.
- I0001's shell consumes R010.

## 12. Security And Audit

- Denied writes are recorded with actor, target tenant, capability, and reason.
- Cached sets never outlive the session and are cleared on invalidation.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                               | Requirements           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| AC01      | The API refuses to start with an undeclared, uncatalogued, or misused `read` capability.                                      | I0005-R001, I0005-R002 |
| AC02      | Required capabilities carry the target tenant; tenant-level records use `NAP`.                                                | I0005-R003             |
| AC03      | Patterns come only from the home tenant; archived and inactive sources contribute nothing.                                    | I0005-R004             |
| AC04      | Matching follows R005: tenant `*` excludes Napsoft, and an unentitled module never matches.                                   | I0005-R005             |
| AC05      | Denials return the 403 body with a reason; denied writes write an event.                                                      | I0005-R006, I0005-R007 |
| AC06      | Role, assignment, membership, and entitlement changes take effect on the next request; an unreachable cell denies.            | I0005-R008, I0005-R009 |
| AC07      | The capabilities endpoint matches server decisions; the web app hides unmatched routes and actions and shows the denied page. | I0005-R010, I0005-R011 |

## 14. Outstanding Questions

None.
