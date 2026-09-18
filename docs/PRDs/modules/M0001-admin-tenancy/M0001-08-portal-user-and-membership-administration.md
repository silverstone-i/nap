# M0001-08: Portal-User and Membership Administration

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Type                 | Module work unit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Owner                | To be confirmed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Related architecture | [Module map](../../../architecture/module-map.md), [Module design](../../../architecture/module-design.md)                                                                                                                                                                                                                                                                                                                                                                                                 |
| Related PRDs         | [M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md), [M0001-03: Authentication](M0001-03-authentication.md), [M0001-05: Authorization](M0001-05-authorization.md), [M0001-07: Tenant Creation](M0001-07-tenant-creation.md), [M0001-09: Tenant Selection and Support Access](M0001-09-tenant-selection-and-support-access.md), [M0001-11: Cache Consistency](M0001-11-cache-consistency.md), [M0001-12: Administrative Events](M0001-12-administrative-events.md) |
| Related decisions    | None recorded separately; unresolved decisions are in section 14                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Last reviewed        | 2026-09-18                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## 2. Purpose

Maintain ordinary portal users and central tenant memberships, and record
requested membership provisioning and its failures without requiring cell-side
identity creation.

## 3. Scope

### Included

- Ordinary portal-user and membership creation and maintenance.
- Central validation and permitted lifecycle changes.
- Membership provisioning-job storage and result tracking.

### Excluded

- Root bootstrap and password verification.
- Creating `cell.tenant_user_bindings` or business-directory records.
- Tenant role assignment and support impersonation.

## 4. Actors And Permissions

| Context                                         | Actor                               | Required authority or state                    | Result                             |
| ----------------------------------------------- | ----------------------------------- | ---------------------------------------------- | ---------------------------------- |
| Create or maintain ordinary user                | Administrator                       | Explicit operation capability and target scope | Apply allowed central changes      |
| Create or maintain membership                   | Administrator                       | Explicit capability covering the target tenant | Apply allowed relationship changes |
| Report provisioning result                      | Trusted workflow                    | Matching registered job and membership         | Update central progress or failure |
| Change unrelated tenant membership              | Caller without target authority     | Target outside authorized scope                | Deny                               |
| Self-service or delegated tenant administration | Portal user or tenant administrator | Rules unresolved                               | No implicit grant                  |

The administrator role, self-service permissions, and cross-tenant identity
maintenance rules remain open in Q01.

## 5. Concepts And Terminology

| Term                 | Meaning                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| Ordinary portal user | A centrally administered person other than the bootstrap root identity        |
| Membership           | Central relationship between a portal user and tenant                         |
| Provisioning job     | Recorded request to establish the membership's required cell-side records     |
| Binding              | Cell-local link between central membership and the relevant business identity |

## 6. Functional Requirements

- M0001-08-R001: Authorized operations must create and maintain ordinary portal users through the foundation contracts.
- M0001-08-R002: Authorized operations must create and maintain central memberships between existing portal users and tenants.
- M0001-08-R003: The module must record requested membership provisioning in `admin.provisioning_jobs` and expose its status and failure information.
- M0001-08-R004: Central user and membership operations must not require cell bindings or employee, client, vendor, or vendor-contact creation.
- M0001-08-R005: Provisioning results must be attributable to the requested central membership and job; failed provisioning must not be reported as completed.

## 7. Business Rules And Invariants

- M0001-08-R006: Membership administration must validate the actor's target-tenant authority; changing an identifier must not bypass that boundary.

[M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md) owns identity and relationship constraints. Creating membership does
not itself create a cell role assignment or establish cell readiness.
Job request deduplication and stale/repeated result handling remain open in Q03.

## 8. Lifecycle And State Transitions

| Central operation               | Required outcome                            | Unresolved rules                                |
| ------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| Create user                     | Central person identity                     | Initial status and credential setup             |
| Create membership               | Central user/tenant relationship            | Initial status and membership kind              |
| Maintain identity or membership | Authorized valid change                     | Allowed fields, disable, re-enable, and removal |
| Request provisioning            | Persist a job tied to the membership        | Eligibility and duplicate handling              |
| Receive failure                 | Persist actionable failure state            | Retry authority and recovery rules              |
| Receive success                 | Persist a result matching the requested job | Completion evidence from the receiving workflow |

Exact state names and transitions are open in Q02–Q03. Central creation success
and downstream provisioning success are separate outcomes.

## 9. Data Requirements

| Table                       | This unit's contract                                                         | Required access and sensitivity                                      |
| --------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `admin.portal_users`        | Ordinary administration fields and state; credentials follow unit 3          | Authorized identity lookup/update; personal data                     |
| `admin.portal_user_tenants` | Membership administration fields, state, and provisioning linkage            | Query by tenant and user; access-sensitive relationship              |
| `admin.provisioning_jobs`   | Job identity, target membership, requested work, status, and failure details | Queue/inspect work and correlate results; sensitive operational data |

Exact requested-work fields and any external result identifiers require Q03.
They do not create cross-database foreign keys. Foundation keys and retention
remain authoritative in unit 1; job retention is decided here.

## 10. API Requirements

| Operation                       | Input                                                | Result                             |
| ------------------------------- | ---------------------------------------------------- | ---------------------------------- |
| Create or update portal user    | Authorized actor and allowed identity fields         | Central user or validation failure |
| Create or update membership     | Actor, user, tenant, and allowed membership fields   | Central relationship or rejection  |
| Request membership provisioning | Authorized target membership and agreed work request | Job identity and central status    |
| Inspect or report job result    | Authorized read or trusted result for a job          | Central progress/failure state     |

Routes, methods, response/error schemas, idempotency, concurrency,
and per-field permissions remain open in Q01–Q03.

## 11. Cross-Module Interactions

- [M0001-03: Authentication](M0001-03-authentication.md) owns credential setup effects and verification behavior.
- [M0001-09: Tenant Selection and Support Access](M0001-09-tenant-selection-and-support-access.md) consumes membership state for selection decisions.
- Cell tenancy owns `cell.tenant_user_bindings` under the receiving contract.
- Business Directory owns employee, client, vendor, and vendor-contact creation.

“Core” in the work breakdown refers here to the business-directory dependency;
[the module map](../../../architecture/module-map.md) names that owner
`business-directory`. The cross-module workflow and binding schema still need
agreement. This unit is testable through job requests and supplied result fixtures.

## 12. Security And Audit

- M0001-08-R007: Administration responses and provisioning failures must not disclose credentials or memberships outside the caller's authorized scope.

[M0001-11: Cache Consistency](M0001-11-cache-consistency.md) defines invalidation for user and membership changes; [M0001-12: Administrative Events](M0001-12-administrative-events.md) defines
administrative and provisioning events. Session effects of disabling or removing
a membership are coordinated with units 4 and 9, not left to UI visibility.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                        | Requirements                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC01      | Authorized ordinary user and membership maintenance persists valid central records.                                                                    | M0001-08-R001, M0001-08-R002                                                                                                                           |
| AC02      | Provisioning requests have inspectable central jobs and failures.                                                                                      | M0001-08-R003                                                                                                                                          |
| AC03      | Central creation works without cell bindings or business records.                                                                                      | M0001-08-R004                                                                                                                                          |
| AC04      | Failure and success fixtures update only the matching membership/job; failure does not imply completion.                                               | M0001-08-R005                                                                                                                                          |
| AC05      | Substituting another tenant or user outside scope is rejected.                                                                                         | M0001-08-R006                                                                                                                                          |
| AC06      | Responses and recorded failures omit credentials and memberships outside the caller's authorized scope.                                                | M0001-08-R007                                                                                                                                          |
| AC07      | Applicable source mutations invalidate their cached decisions and record the required catalogue events; failures follow the accepted shared contracts. | [M0001-11-R002](M0001-11-cache-consistency.md#6-functional-requirements), [M0001-12-R001](M0001-12-administrative-events.md#6-functional-requirements) |

## 14. Open Questions

| ID  | Decision required before acceptance                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q01 | Who can perform each operation or change each field, including self-service and users shared across tenants?                                             |
| Q02 | Which fields and states define ordinary users and memberships, and what are the disable, re-enable, removal, credential-initiation, and session effects? |
| Q03 | What are the provisioning-job payload, trusted result, retry, deduplication, concurrency, API, failure, and retention contracts?                         |
| Q04 | Which binding and business-record types can be requested, and what identifiers must the receiving workflow return?                                       |
