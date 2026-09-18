# M0001-09: Tenant Selection and Support Access

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Type                 | Module work unit                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                                                                                                                                                                                                                                                                                                |
| Owner                | To be confirmed                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Related architecture | [BFF](../../../architecture/bff.md), [Admin and cells](../../../architecture/admin-cells.md)                                                                                                                                                                                                                                                                                                                                     |
| Related PRDs         | [M0001-04: Session Management](M0001-04-session-management.md), [M0001-05: Authorization](M0001-05-authorization.md), [M0001-07: Tenant Creation](M0001-07-tenant-creation.md), [M0001-08: Portal-User and Membership Administration](M0001-08-portal-user-and-membership-administration.md), [M0001-11: Cache Consistency](M0001-11-cache-consistency.md), [M0001-12: Administrative Events](M0001-12-administrative-events.md) |
| Related decisions    | None recorded separately; unresolved decisions are in section 14                                                                                                                                                                                                                                                                                                                                                                 |
| Last reviewed        | 2026-09-18                                                                                                                                                                                                                                                                                                                                                                                                                       |

## 2. Purpose

Validate central tenant membership, record an authorized tenant selection in a
session, and control support access or impersonation with clear actor attribution.

## 3. Scope

### Included

- Membership-based tenant selection and changes to session tenant context.
- Central permission checks for support access or impersonation.
- Entry, exit, and attribution of any approved support context.

### Excluded

- Creating sessions, users, memberships, or platform-role assignments.
- Opening tenant database transactions and enforcing cell-local permissions.
- Defining an unrestricted support bypass or automatic tenant membership.

## 4. Actors And Permissions

| Context                 | Actor                     | Required state or authority                                 | Result                                                |
| ----------------------- | ------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| Select tenant normally  | Authenticated portal user | Eligible membership and tenant under Q01                    | Record selected tenant                                |
| Select unrelated tenant | Authenticated portal user | No eligible membership and no approved support authority    | Deny                                                  |
| Begin support access    | Authenticated operator    | Matching explicit platform capability and Q02 prerequisites | Establish the approved support context                |
| Begin impersonation     | Authenticated operator    | Explicit impersonation rules, target, and authorization     | Establish attributed context only if the rules permit |
| End support context     | Authorized session actor  | Existing support context                                    | Remove it according to the restoration contract       |

Holding `support` or `platform_admin` alone does not resolve the action catalogue
or impersonation rules. Unit 5 supplies assignments; Q02 establishes permitted
support actions.

## 5. Concepts And Terminology

| Term             | Meaning                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Tenant selection | Central decision attaching an authorized tenant to a session                              |
| Support access   | Approved operator access to a tenant outside ordinary membership use                      |
| Impersonation    | Approved operation using another user's effective identity while retaining the real actor |
| Real actor       | Portal user who authenticated and initiated the action                                    |
| Effective actor  | Identity whose permissions apply during an approved impersonation context                 |

## 6. Functional Requirements

- M0001-09-R001: Normal tenant selection must validate the authenticated user's central membership and the target tenant's eligibility before changing session context.
- M0001-09-R002: A failed selection must leave the existing session tenant context unchanged.
- M0001-09-R003: Support access or impersonation must require explicit authorization and the agreed entry conditions; it must not be inferred from a supplied tenant or user ID.
- M0001-09-R004: Approved support context must retain the real actor, target tenant, and effective actor where impersonation applies.
- M0001-09-R005: The module must support ending approved support context and applying the agreed restoration or termination result.

## 7. Business Rules And Invariants

- M0001-09-R006: Central selection must return enough validated context for later routing without allowing the browser to choose a database or cell connection.
- M0001-09-R007: Selecting a tenant centrally must not claim that a tenant transaction has opened or that cell-local authorization succeeded.

[M0001-04: Session Management](M0001-04-session-management.md) owns session validity and storage. Tenant readiness, membership states,
and central behavior when no usable assignment exists remain open in Q01.
The admin deliverable includes making that decision; the transaction it enables
belongs to later integration.

## 8. Lifecycle And State Transitions

| Starting context       | Request                     | Central outcome                       |
| ---------------------- | --------------------------- | ------------------------------------- |
| Valid ordinary session | Eligible tenant selection   | Selected tenant recorded              |
| Valid session          | Ineligible tenant selection | Rejection; previous context preserved |
| Valid operator session | Approved support entry      | Attributed support context            |
| Support context        | Approved exit               | Restoration or termination under Q03  |
| Any context            | Session loses validity      | Unit 4 lifecycle applies              |

Whether tenant switching is allowed during support, whether nesting is allowed,
and how role or membership changes terminate context are open in Q03.

## 9. Data Requirements

| Table                       | Use in this work unit                                                               |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `admin.sessions`            | Persist selected tenant and agreed support attribution; base schema owned by unit 4 |
| `admin.portal_user_tenants` | Read membership eligibility; schema and maintenance owned by units 1 and 8          |
| `admin.tenants`             | Read central eligibility and assignment context                                     |
| `admin.platform_roles`      | Read operator assignments through unit 5                                            |

Selected-tenant and support fields extend `sessions`; exact columns and history
requirements are open in Q03. Selection does not rewrite membership or platform
assignments. Support attribution is sensitive administrative data.

## 10. API Requirements

| Operation               | Input                                                          | Result                                |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------- |
| List selectable tenants | Valid session                                                  | Centrally permitted choices under Q01 |
| Select tenant           | Valid session and tenant identity                              | Updated central context or rejection  |
| Enter support context   | Valid operator session, tenant, and any approved target/reason | Attributed context or rejection       |
| Exit support context    | Valid session and authorized exit request                      | Context restored or ended             |

HTTP routes, public response/error fields, retry handling, concurrent switches,
and session rotation during entry/exit are open in Q03.

## 11. Cross-Module Interactions

[M0001-04: Session Management](M0001-04-session-management.md) supplies session lifecycle, [M0001-05: Authorization](M0001-05-authorization.md) platform assignments, and [M0001-08: Portal-User and Membership Administration](M0001-08-portal-user-and-membership-administration.md)
membership state. C0002: Session Management owns selection UI and C0003: RBAC
owns the broader support and tenant authorization integration.

The receiving runtime work opens and authorizes the transaction in the assigned
cell. Central tests use assignment and eligibility fixtures; real cell routing
requires separate integration evidence.

## 12. Security And Audit

- M0001-09-R008: Support and impersonation actions must retain real-actor attribution for the administrative event contract.

[M0001-12: Administrative Events](M0001-12-administrative-events.md) owns the event fields and required catalogue. [M0001-11: Cache Consistency](M0001-11-cache-consistency.md) owns invalidation
when membership, platform roles, or routing context changes. Consent, reasons,
duration limits, and support data restrictions remain open in Q02.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                        | Requirements                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC01      | Eligible membership selection succeeds; missing or ineligible membership is rejected.                                                                  | M0001-09-R001                                                                                                                                          |
| AC02      | A rejected switch preserves the prior session context.                                                                                                 | M0001-09-R002                                                                                                                                          |
| AC03      | Unauthorized support or impersonation requests fail; approved requests satisfy all agreed access rules.                                                | M0001-09-R003                                                                                                                                          |
| AC04      | Entry records real actor, tenant, and any effective actor; exit follows the agreed restoration rule.                                                   | M0001-09-R004, M0001-09-R005                                                                                                                           |
| AC05      | Client-supplied cell or database choices cannot override validated central context.                                                                    | M0001-09-R006                                                                                                                                          |
| AC06      | Central success does not assert successful cell transaction or authorization.                                                                          | M0001-09-R007                                                                                                                                          |
| AC07      | Support event input preserves the real actor across entry, actions, and exit.                                                                          | M0001-09-R008                                                                                                                                          |
| AC08      | Applicable source mutations invalidate their cached decisions and record the required catalogue events; failures follow the accepted shared contracts. | [M0001-11-R002](M0001-11-cache-consistency.md#6-functional-requirements), [M0001-12-R001](M0001-12-administrative-events.md#6-functional-requirements) |

## 14. Open Questions

| ID  | Decision required before acceptance                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Q01 | Which membership and tenant states permit selection, including pending, unassigned, disabled, or unavailable targets?                         |
| Q02 | Is support access distinct from impersonation, and what capabilities, consent, reason, duration, target, and data restrictions apply to each? |
| Q03 | What session fields, routes, response schemas, rotation, retry, concurrency, nesting, switching, exit, and revocation rules apply?            |
