# M0003-00: Role Catalogue Foundation

## 1. Document Control

| Field                | Value                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| Status               | Implemented                                                                                                  |
| Type                 | Module Work Unit                                                                                             |
| Family               | [M0003: Access Control](../M0003-access-control.md)                                                          |
| Related architecture | [Module map](../../../architecture/module-map.md), [Migration strategy](../../../architecture/migrations.md) |
| Related PRDs         | [M0001-05: Authorization](../M0001-admin-tenancy/M0001-05-authorization.md)                                  |
| Related decisions    | None                                                                                                         |
| Last reviewed        | 2026-09-20                                                                                                   |

## 2. Purpose

Store and resolve tenant-local roles so Admin Tenancy can seed system roles and
validate portal-user role assignments.

## 3. Scope

### Included

- The tenant-local `app.roles` catalogue.
- Immutable system-role identities and capability patterns.
- Tenant RLS, migration registration, seeds, and runtime lookup.

### Excluded

- Custom-role administration APIs.
- Business-resource assignments and access scopes.
- Cell registration, provisioning, and activation.

## 4. Actors And Permissions

| Context | Actor       | Required permission | Required state                 | Result                         |
| ------- | ----------- | ------------------- | ------------------------------ | ------------------------------ |
| Seed    | `nap-admin` | Maintenance access  | Cell migration complete        | Create or verify system roles  |
| Runtime | `nap-app`   | Tenant context      | Configured cell is ready       | Read active roles for a tenant |
| Runtime | `nap-app`   | Any                 | Target is a system-role record | Reject update or deletion      |

## 5. Concepts And Terminology

| Term               | Meaning                                                   |
| ------------------ | --------------------------------------------------------- |
| Role catalogue     | Tenant-local role definitions stored in `app.roles`       |
| System role        | Seeded role with an immutable reserved identity           |
| Capability pattern | Three-component authorization pattern defined by M0001-05 |

## 6. Functional Requirements

- M0003-00-R001: Each role must belong to one tenant and have an immutable UUID and code.
- M0003-00-R002: `platform_admin`, `support`, and `tenant_admin` must be reserved system-role identities; tenant-defined roles must not claim their codes.
- M0003-00-R003: A role must store a JSON array of capability patterns and runtime lookup must reject a role containing an invalid pattern.
- M0003-00-R004: The catalogue must expose tenant-scoped list and UUID-resolution operations to M0001-05.
- M0003-00-R005: An unavailable or unconfigured cell must return `SERVICE_UNAVAILABLE`, never an empty role that could grant authority.

## 7. Business Rules And Invariants

Role UUID, tenant, code, and system-role identity are immutable. Active role
codes and system-role identities are unique within a tenant. Runtime operations
cannot update or delete system roles.

Seeds preserve an existing role UUID. They restore an archived matching system
role and reject any difference in code, name, identity, or capabilities.

## 8. Lifecycle And State Transitions

| State              | Action       | Result                    |
| ------------------ | ------------ | ------------------------- |
| Role absent        | Seed         | Create the system role    |
| Matching role      | Seed         | Return the existing role  |
| Matching archived  | Seed         | Restore the existing UUID |
| Definition differs | Seed         | Reject with role drift    |
| System role active | Runtime edit | Reject                    |

## 9. Data Requirements

`app.roles` stores `id`, `tenant_id`, `code`, `name`, optional `system_role`,
`capabilities`, audit fields, and soft-deletion fields. RLS uses the transaction's
`nap.tenant_id`; client input cannot select a database connection.

## 10. API Requirements

Not applicable. M0001-05 owns the Admin role-list and assignment routes.

## 11. Cross-Module Interactions

M0001-05 supplies the system-role definitions and uses this Work Unit's lookup
contract. Static cell connections use the UUID-keyed runtime registry. M0001-06
later publishes newly provisioned cells into that registry.

## 12. Security And Audit

Role lookup must run under tenant RLS. Connection credentials must not appear in
responses, logs, events, or central database rows. Role assignment audit belongs
to M0001-05.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                   | Requirements                                |
| --------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| AC01      | Migration creates a tenant-scoped role catalogue with reserved, immutable system-role identities. | M0003-00-R001, M0003-00-R002                |
| AC02      | Invalid capability data grants nothing; valid roles list and resolve only inside their tenant.    | M0003-00-R003, M0003-00-R004                |
| AC03      | Repeat seeds preserve UUIDs, restore matching records, and reject drift.                          | M0003-00-R001, M0003-00-R002, M0003-00-R003 |
| AC04      | Missing or unavailable configured cells fail with `SERVICE_UNAVAILABLE`.                          | M0003-00-R005                               |

### Verification Evidence

The M0001-05 verification suite exercises this Work Unit through separate
Admin and cell databases. It verifies the `app.roles` migration, tenant RLS,
reserved identities, system-role immutability, repeat and restoring seeds,
drift rejection, safe lookup, and unavailable-cell behavior. See the
[authorization verification evidence](../M0001-admin-tenancy/M0001-05-authorization.md#verification-evidence).

## 14. Outstanding Questions

None.
