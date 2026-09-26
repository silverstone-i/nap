# I0005: RBAC Decision Model

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Type                 | Inter-module workflow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Related architecture | [Module map](../../architecture/module-map.md), [Admin and cells](../../architecture/admin-cells.md), [BFF](../../architecture/bff.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Related PRDs         | [M0003: Access Control](../modules/M0003-access-control.md), [M0001-05: Authorization](../modules/M0001-admin-tenancy/M0001-05-authorization.md), [M0001-08: Portal User And Membership Administration](../modules/M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md), [M0001-09: Tenant Selection and Support Access](../modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md), [M0001-11: Cache Consistency](../modules/M0001-admin-tenancy/M0001-11-cache-consistency.md), [I0001: Application Entry and Shell](I0001-application-entry-and-shell.md) |
| Related decisions    | The server is authoritative; the UI renders from the same decision the server enforces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Last reviewed        | 2026-09-26                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## 2. Purpose

Today only root users hold capabilities (M0001-05); every other user is
denied. This workflow defines how any session resolves its capabilities from
role assignments, how a request is permitted or denied, and how the UI uses the
same answer to show routes, navigation, and actions. It owns no tables: it
reads `admin.platform_roles` and the tenant's M0003 roles.

## 3. Scope

### Included

- Capability resolution for a session: root, assigned roles, support context.
- Wildcard matching of M0003 capability patterns.
- The Napsoft support restriction.
- Assigning and removing roles for a portal user, with validation against the cell.
- One decision function used by every route, and a session capabilities
  endpoint used by the UI.
- Caching and invalidation of resolved capabilities.
- Permission-aware routes, navigation, actions, and denied state in the UI.

### Excluded

- Role and grant storage: M0003.
- Root grant from `is_root`: M0001-05 (reused, not restated).
- Support entry, expiry, and exit: M0001-09.
- Module entitlement checks: separate workflow; this decision runs after them.

## 4. Actors And Permissions

Authorization decision table. "Assigned set" is the union of grants of the
user's active assignments whose role is active in the relevant tenant's cell.

| Session                   | Actor                    | Target             | Capability source                                    | Result                                   |
| ------------------------- | ------------------------ | ------------------ | ---------------------------------------------------- | ---------------------------------------- |
| Platform, normal          | Active root              | Any central record | M0001-05 `platform_admin` set                        | Permit if capability in set              |
| Platform, normal          | Active non-root          | Any central record | Assigned set in the owning tenant                    | Permit if capability matched             |
| Tenant, normal            | Active member            | Selected tenant    | Assigned set in the selected tenant                  | Permit if capability matched             |
| Tenant, normal            | Non-member or inactive   | Selected tenant    | —                                                    | Deny                                     |
| Support                   | Root or `platform_admin` | Selected tenant    | Selected tenant's `tenant_admin` grants              | Permit reads only                        |
| Support                   | `support`                | Non-Napsoft tenant | Selected tenant's `tenant_admin` grants              | Permit reads only                        |
| Support                   | `support`                | Napsoft tenant     | —                                                    | Deny without tenant data (M0001-09-R003) |
| Support, acting as a user | Real operator            | Selected tenant    | Intersection of effective user's set and support set | Permit reads only                        |
| Any, restricted session   | Any                      | Any                | —                                                    | Deny                                     |
| Any                       | Inactive or missing user | Any                | —                                                    | Deny `FORBIDDEN`                         |

## 5. Concepts And Terminology

| Term            | Meaning                                                                              |
| --------------- | ------------------------------------------------------------------------------------ |
| Assignment      | Active `admin.platform_roles` row linking a portal user to a role in a tenant's cell |
| Resolved set    | The capability patterns a session holds after applying the decision table            |
| Decision        | `permit` or `deny` with a reason code for one capability                             |
| Read capability | A capability whose action is `read`                                                  |

## 6. Functional Requirements

- I0005-R001: Every protected route must call one decision function, `authorize(session, capability)`, before it runs; routes must not check roles directly.
- I0005-R002: Resolution must follow the Section 4 decision table, reusing M0001-05 for root.
- I0005-R003: A pattern matches a capability when each position is equal or the pattern holds `*` there (M0003-R003 grammar).
- I0005-R004: An assignment grants nothing when it is archived, its user or membership is inactive, or its role is missing or archived in the cell.
- I0005-R005: A decision must return a reason: `ROOT`, `ROLE`, `SUPPORT_READ`, `NO_CAPABILITY`, `SUPPORT_WRITE_DENIED`, `NAPSOFT_DENIED`, `INACTIVE`, or `RESTRICTED`.
- I0005-R006: A denied request must return HTTP 403 with `{ error: 'FORBIDDEN', capability, reason }` and write a denial event (M0001-12).
- I0005-R007: `POST /api/admin-tenancy/v1/accounts/users/:id/roles` must assign a role; it must verify in the tenant's cell that the role exists and is active, and that the user has an active membership in that tenant.
- I0005-R008: `DELETE /api/admin-tenancy/v1/accounts/users/:id/roles/:assignmentId` must archive an assignment.
- I0005-R009: A caller must not create or edit a role grant, or assign a role, whose capabilities exceed the caller's own resolved set.
- I0005-R010: A tenant must keep at least one active assignment of `tenant_admin`; removing the last one must be rejected with `LAST_TENANT_ADMIN`.
- I0005-R011: Resolved sets may be cached per session and tenant; an assignment change, a role or grant change (M0003-R011), a membership change, or a support entry or exit must invalidate the affected entries using M0001-11.
- I0005-R012: `GET /api/admin-tenancy/v1/sessions/current/capabilities` must return the session's resolved set and support mode, computed by the same function as R001.
- I0005-R013: The UI must load R012 at shell entry and after tenant or support changes, and must:
  - hide navigation entries and routes whose capability is not matched;
  - hide or disable actions whose capability is not matched;
  - show a denied page for a direct URL to a route the session cannot use;
  - show the 403 reason when the server denies an action the UI allowed, and reload capabilities.
- I0005-R014: The role-assignment UI in Portal Users must list a user's assignments per tenant and allow assign and remove, subject to R007–R010.

## 7. Business Rules And Invariants

- The server decides; UI visibility never grants access (request authorization).
- Support sessions never write tenant data (application workflow; matches M0002 tenant context).
- `is_root` remains the only non-role capability source (M0001-05).
- An assignment's role reference crosses databases, so validation happens in the workflow, not by foreign key.

## 8. Lifecycle And State Transitions

| State             | Action                | Result                                                       |
| ----------------- | --------------------- | ------------------------------------------------------------ |
| No assignment     | Assign                | Active assignment; cache invalidated; event written          |
| Active assignment | Remove                | Archived; cache invalidated; rejected if last `tenant_admin` |
| Active assignment | Role archived in cell | Grants nothing (R004); row unchanged                         |
| Active assignment | Membership suspended  | Grants nothing (R004)                                        |

## 9. Data Requirements

Not applicable: this workflow owns no tables. It reads `admin.portal_users`,
`admin.portal_user_tenants`, `admin.platform_roles`, `admin.sessions`, and
M0003 `app.roles` and `app.role_grants`.

## 10. API Requirements

| Method and route                                                      | Capability                    | Request              | Response                           | Errors                                                            |
| --------------------------------------------------------------------- | ----------------------------- | -------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| `GET /api/admin-tenancy/v1/sessions/current/capabilities`             | Authenticated session         | —                    | `{ capabilities[], mode, tenant }` | —                                                                 |
| `GET /api/admin-tenancy/v1/accounts/users/:id/roles`                  | `admin-tenancy::roles::read`  | `?tenant`            | Assignments with role names        | `NOT_FOUND`                                                       |
| `POST /api/admin-tenancy/v1/accounts/users/:id/roles`                 | `admin-tenancy::roles::write` | `{ tenant, roleId }` | Assignment                         | `ROLE_NOT_FOUND`, `NOT_MEMBER`, `GRANT_EXCEEDS_ACTOR`, `CONFLICT` |
| `DELETE /api/admin-tenancy/v1/accounts/users/:id/roles/:assignmentId` | `admin-tenancy::roles::write` | —                    | 204                                | `LAST_TENANT_ADMIN`, `NOT_FOUND`                                  |

Assign is idempotent for an existing active assignment of the same role.

## 11. Cross-Module Interactions

- Reads M0003 roles in the tenant's cell through the I0003 runtime registry.
  If the cell is not ready, assignment fails with `CELL_UNAVAILABLE` and
  resolution denies tenant-scoped capabilities for that tenant.
- Platform (non-root) resolution reads the owning tenant's cell.
- Uses M0001-11 for invalidation and M0001-12 for events.
- I0001 shell consumes R012.

## 12. Security And Audit

- Deny by default: an unknown capability or failed lookup denies.
- Self-escalation is blocked by R009 and the last-admin rule R010.
- Assignment changes and denials are recorded with real actor, effective user, tenant, and capability.
- Cached sets must not outlive the session and are cleared on invalidation.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                           | Requirements           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| AC01      | Tests cover every Section 4 row, including Napsoft denial and support read-only.                                                          | I0005-R002, I0005-R005 |
| AC02      | Wildcard and exact patterns match as specified.                                                                                           | I0005-R003             |
| AC03      | Archived roles, archived assignments, and suspended memberships grant nothing.                                                            | I0005-R004             |
| AC04      | Every protected route uses `authorize`; a denied call returns the 403 body and writes an event.                                           | I0005-R001, I0005-R006 |
| AC05      | Assign validates role and membership in the cell; remove rejects the last `tenant_admin`; escalation is rejected.                         | I0005-R007–I0005-R010  |
| AC06      | Assignment, role, membership, and support changes invalidate cached sets.                                                                 | I0005-R011             |
| AC07      | The capabilities endpoint matches server decisions; the shell hides unmatched routes, navigation, and actions, and shows the denied page. | I0005-R012, I0005-R013 |
| AC08      | Portal Users shows, assigns, and removes role assignments.                                                                                | I0005-R014             |

## 14. Outstanding Questions

- Should a support session's read set be the tenant's `tenant_admin` grants, or a separate fixed list?
- Should `tenant_admin` manage members and assignments in its own tenant (needs scoped `admin-tenancy::accounts::*` and `admin-tenancy::roles::*`), or stay platform-only for now?
- Is a 403 denial event required for every denied request, or only for writes, given the volume?
