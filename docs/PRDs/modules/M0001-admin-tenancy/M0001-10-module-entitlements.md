# M0001-10: Module Entitlements

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                            |
| Type                 | Module work unit                                                                                                                                                                                                                                                                                                                                 |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                                                                                                                                                                                                                |
| Owner                | To be confirmed                                                                                                                                                                                                                                                                                                                                  |
| Related architecture | [Module map](../../../architecture/module-map.md)                                                                                                                                                                                                                                                                                                |
| Related PRDs         | [M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md), [M0001-05: Authorization](M0001-05-authorization.md), [M0001-07: Tenant Creation](M0001-07-tenant-creation.md), [M0001-11: Cache Consistency](M0001-11-cache-consistency.md), [M0001-12: Administrative Events](M0001-12-administrative-events.md) |
| Related decisions    | None recorded separately; unresolved decisions are in section 14                                                                                                                                                                                                                                                                                 |
| Last reviewed        | 2026-09-18                                                                                                                                                                                                                                                                                                                                       |

## 2. Purpose

Store which modules each tenant may use and expose that central entitlement
state to authorized admin operations and later cell projections.

## 3. Scope

### Included

- Central module-entitlement schema, validation, reads, and changes.
- Tenant/module relationships and entitlement state.
- The source-data contract for later projection work.

### Excluded

- `cell.entitlement_projections` and cell-side enforcement.
- Billing, commercial plan calculations, and implicit tier-to-module mappings.
- Tenant roles or user-specific permissions.

## 4. Actors And Permissions

| Context                                          | Actor                                        | Required authority or condition               | Result                                          |
| ------------------------------------------------ | -------------------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| Read or change tenant entitlement                | Operator                                     | Matching platform capability and tenant scope | Return or apply valid central entitlement state |
| Consume entitlement data                         | Authorized application or projection service | Trusted internal context                      | Read central source data                        |
| Change entitlement using tenant membership alone | Portal user                                  | No matching administrative grant              | Deny                                            |
| Grant unknown module                             | Any caller                                   | Module identity is invalid                    | Reject under the agreed module catalogue        |

Capability keys and any tenant self-service read rights remain open in Q01.

## 5. Concepts And Terminology

| Term                   | Meaning                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| Module entitlement     | Tenant-level permission to use a module                                       |
| Module identity        | Stable name or identifier from the accepted module catalogue                  |
| Entitlement projection | Cell-local representation of central entitlement state                        |
| User permission        | Authorization for an actor's action; distinct from tenant module availability |

## 6. Functional Requirements

- M0001-10-R001: The module must persist central tenant/module entitlements in `admin.module_entitlements`.
- M0001-10-R002: Authorized consumers must be able to determine a tenant's central entitlement state for a module and inspect its entitlement records.
- M0001-10-R003: Authorized administration must support granting and withdrawing module use under the agreed entitlement lifecycle.
- M0001-10-R004: Central entitlement operations must not require a cell projection to exist or succeed.

## 7. Business Rules And Invariants

- M0001-10-R005: Entitlement records must reference an existing central tenant and a valid module identity under the agreed catalogue contract.
- M0001-10-R006: An entitlement change must not itself grant platform roles or tenant-user permissions.

Default entitlements, absence semantics, mandatory modules, effective dates, and
whether withdrawal changes state or removes a row remain open in Q02. No tier
mapping is inferred from tenant registration metadata.

## 8. Lifecycle And State Transitions

| Operation           | Central outcome                      | Cell outcome                               |
| ------------------- | ------------------------------------ | ------------------------------------------ |
| Grant module use    | Persist the agreed entitled state    | Projection handled separately              |
| Withdraw module use | Persist the agreed withdrawal result | Enforcement propagation handled separately |
| Read entitlement    | Return central state                 | No assertion about projection freshness    |

Exact stored states, repeat changes, scheduled changes, and restoration behavior
require Q02–Q03.

## 9. Data Requirements

| Table                       | Required meaning                                                          | Access and sensitivity                                        |
| --------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `admin.module_entitlements` | Central tenant reference, module identity, and entitlement representation | Lookup by tenant/module; list by tenant; access configuration |

The authoritative module catalogue, key types, tenant/module uniqueness,
change metadata, deletion, and retention are open in Q01–Q03. The database
representation does not require a cross-database reference to a projection.

## 10. API Requirements

| Operation                | Input                                      | Result                                          |
| ------------------------ | ------------------------------------------ | ----------------------------------------------- |
| Read tenant entitlements | Authorized tenant identity                 | Central records and agreed state interpretation |
| Grant or withdraw        | Actor, tenant, module, and intended change | Persisted outcome or rejection                  |
| Supply projection data   | Trusted request for source state           | Data required by W0003's agreed contract        |

Methods, routes, payloads, error codes, idempotency, and competing updates remain
open in Q03. A mutation response reports central persistence, not successful
cell-side enforcement.

## 11. Cross-Module Interactions

[M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md) and [M0001-07: Tenant Creation](M0001-07-tenant-creation.md) supply tenant identity; [M0001-05: Authorization](M0001-05-authorization.md) supplies operator authority.
[M0001-11: Cache Consistency](M0001-11-cache-consistency.md) defines central entitlement-cache invalidation.

M0002: Cell Tenancy owns the future `cell.entitlement_projections` contract.
W0003: Projection Synchronization owns delivery and reconciliation, and the
receiving cell authorization work owns enforcement.

## 12. Security And Audit

- M0001-10-R007: Entitlement reads and changes must enforce the caller's authorized tenant scope.

[M0001-12: Administrative Events](M0001-12-administrative-events.md) defines the grant/withdrawal event contract. Projection lag and loss of
module access require later integration acceptance; central tests must not be
reported as proof that access was removed in every cell.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                        | Requirements                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC01      | Central entitlements persist and can be inspected by tenant and module.                                                                                | M0001-10-R001, M0001-10-R002                                                                                                                           |
| AC02      | Authorized grant and withdrawal follow the agreed lifecycle, including repeats and races.                                                              | M0001-10-R003                                                                                                                                          |
| AC03      | Central changes work without cell databases or projections.                                                                                            | M0001-10-R004                                                                                                                                          |
| AC04      | Unknown tenants and invalid module identities are rejected.                                                                                            | M0001-10-R005                                                                                                                                          |
| AC05      | Entitlement changes do not create role assignments or user permissions.                                                                                | M0001-10-R006                                                                                                                                          |
| AC06      | Out-of-scope reads and changes are rejected.                                                                                                           | M0001-10-R007                                                                                                                                          |
| AC07      | Applicable source mutations invalidate their cached decisions and record the required catalogue events; failures follow the accepted shared contracts. | [M0001-11-R002](M0001-11-cache-consistency.md#6-functional-requirements), [M0001-12-R001](M0001-12-administrative-events.md#6-functional-requirements) |

## 14. Open Questions

| ID  | Decision required before acceptance                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------- |
| Q01 | Which module catalogue and operator capabilities apply, and who can read tenant entitlements?                                   |
| Q02 | What do absent records mean, which modules are mandatory or default, and what grant/withdrawal states or effective dates exist? |
| Q03 | What are the schema uniqueness, APIs, concurrency, repeated-change, history, retention, and projection-source contracts?        |
