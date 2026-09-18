# M0001-07: Tenant Creation

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Type                 | Module work unit                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                                                                                                                                                                                                                                                                                                                              |
| Owner                | To be confirmed                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Related architecture | [Admin and cells](../../../architecture/admin-cells.md)                                                                                                                                                                                                                                                                                                                                                                                                        |
| Related PRDs         | [M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md), [M0001-05: Authorization](M0001-05-authorization.md), [M0001-06: Cell Management](M0001-06-cell-management.md), [M0001-08: Portal-User and Membership Administration](M0001-08-portal-user-and-membership-administration.md), [M0001-11: Cache Consistency](M0001-11-cache-consistency.md), [M0001-12: Administrative Events](M0001-12-administrative-events.md) |
| Related decisions    | None recorded separately; unresolved decisions are in section 14                                                                                                                                                                                                                                                                                                                                                                                               |
| Last reviewed        | 2026-09-18                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## 2. Purpose

Create a valid central tenant record without requiring cell assignment or
provisioning.

## 3. Scope

### Included

- Central tenant creation and registration metadata.
- Validation, duplicate handling, and a truthful central creation result.
- The tenant identity supplied to later provisioning work.

### Excluded

- Cell assignment, `cell.tenants` projection, provisioning, and activation.
- Status synchronization from cells.
- Creating users, memberships, or business records.

## 4. Actors And Permissions

| Context                           | Actor                               | Required authority or state       | Result                                     |
| --------------------------------- | ----------------------------------- | --------------------------------- | ------------------------------------------ |
| Create central tenant             | Operator                            | Matching capability from unit 5   | Create a valid central record              |
| Read creation result              | Authorized caller                   | Scope includes the created tenant | Return central identity and creation state |
| Create without platform authority | Portal user or tenant administrator | No matching platform grant        | Deny                                       |
| Complete cell provisioning        | External workflow                   | Separate integration contract     | Not implied by successful creation         |

Exact capability names and read scope remain open in Q01.

## 5. Concepts And Terminology

| Term             | Meaning                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| Central creation | Establishing the tenant's admin record                                   |
| Assignment       | Linking a tenant to an eligible registered cell                          |
| Activation       | Declaring the tenant ready for use after provisioning prerequisites pass |
| Tier             | Registration metadata whose allowed values and effects remain undecided  |

## 6. Functional Requirements

- M0001-07-R001: An authorized central creation operation must persist the tenant's agreed code, name, and tier and return its stable identity.
- M0001-07-R002: Central creation must succeed without a cell assignment or cell-side records.
- M0001-07-R003: The creation result must distinguish central record creation from provisioning or activation and must not claim cell readiness.
- M0001-07-R004: Invalid input or a duplicate identity must follow the agreed validation and duplicate-request contract without creating an unintended additional tenant.

## 7. Business Rules And Invariants

[M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md) owns tenant identity and database uniqueness. This unit owns creation
validation and the meaning of its result. A central tenant can precede its cell
assignment; the exact representation is open in Q02.

When assignment is performed later, the admin/cell architecture requires an
enabled registered cell. Reassignment is limited to a pending, unprovisioned
tenant with no memberships and before provisioning begins. Those are assignment
integration constraints, not prerequisites for central creation.

## 8. Lifecycle And State Transitions

| Condition                    | Operation                   | Result                                                        |
| ---------------------------- | --------------------------- | ------------------------------------------------------------- |
| No central tenant            | Authorized valid creation   | Persisted central tenant awaiting any required later work     |
| Invalid or conflicting input | Creation attempt            | Rejected or recognized as the same request under Q03          |
| Central tenant exists        | Later provisioning workflow | Apply the separately agreed assignment and lifecycle contract |

Initial state values and the representation of unassigned tenants remain open.
This unit does not define the entire operational tenant lifecycle.

## 9. Data Requirements

| Table           | Fields owned by this operation                      | Required access                                            |
| --------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| `admin.tenants` | Code, name, tier, and agreed initial creation state | Persist and retrieve the created tenant by stable identity |

Foundation keys are defined by [M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md). The architecture's `cell_id`, provisioning
state, status, and RBAC-readiness fields need a later integration contract that
supports pre-assignment central records. No default cell, tier, or readiness
value is invented here. Retention and deletion follow the foundation decision.

## 10. API Requirements

The central operation accepts tenant metadata and returns its identity and
central state. Exact HTTP exposure and response/error schemas remain open.

The architecture also defines this integrated command:

```text
POST /api/admin-tenancy/v1/control/registry
```

```json
{
  "operation": "tenant",
  "code": "ACME",
  "name": "Acme Construction",
  "tier": "starter",
  "cell": "<cell-uuid>"
}
```

That example includes a cell assignment. It does not establish the request shape
for central-only creation. Q02 must settle whether central creation has a
separate entry point or is invoked internally by the integrated command.

Duplicate requests, competing creates, and partial integrated-command failures
require the contract in Q03.

## 11. Cross-Module Interactions

W0001: Tenant Provisioning consumes the central tenant identity. Cell assignment,
projection, activation, and status synchronization are receiving-roadmap work.
[M0001-06: Cell Management](M0001-06-cell-management.md) supplies the cell registry when assignment is implemented.

[M0001-08: Portal-User and Membership Administration](M0001-08-portal-user-and-membership-administration.md) uses the tenant identity for membership administration. Creation alone
does not authorize a user or create membership.

## 12. Security And Audit

- M0001-07-R005: Tenant creation must require an authorized actor and return only the central metadata permitted for that actor.

[M0001-11: Cache Consistency](M0001-11-cache-consistency.md) defines cached-registry invalidation; [M0001-12: Administrative Events](M0001-12-administrative-events.md) defines the creation
event. Neither a requested tier nor successful creation grants platform access.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                        | Requirements                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC01      | Authorized valid input creates a tenant with the agreed metadata and stable identity.                                                                  | M0001-07-R001                                                                                                                                          |
| AC02      | Creation succeeds with no cells configured and no cell projections.                                                                                    | M0001-07-R002                                                                                                                                          |
| AC03      | The result reports central creation without asserting assignment, activation, or runtime readiness.                                                    | M0001-07-R003                                                                                                                                          |
| AC04      | Invalid, duplicate, and competing requests satisfy the agreed identity and idempotency rules.                                                          | M0001-07-R004                                                                                                                                          |
| AC05      | A caller without the creation capability is denied and cannot disclose unrelated tenant data.                                                          | M0001-07-R005                                                                                                                                          |
| AC06      | Applicable source mutations invalidate their cached decisions and record the required catalogue events; failures follow the accepted shared contracts. | [M0001-11-R002](M0001-11-cache-consistency.md#6-functional-requirements), [M0001-12-R001](M0001-12-administrative-events.md#6-functional-requirements) |

## 14. Open Questions

| ID  | Decision required before acceptance                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q01 | What metadata validation, tier values, creation capability, and read capabilities apply?                                                                    |
| Q02 | What is the initial state and unassigned representation, and how is central-only creation exposed alongside the architecture's integrated registry command? |
| Q03 | What duplicate-request, concurrent-create, response/error, and integrated-command recovery contracts apply?                                                 |
