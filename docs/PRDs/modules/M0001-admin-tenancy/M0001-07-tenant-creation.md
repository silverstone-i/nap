# M0001-07: Tenant Creation

## 1. Document Control

| Field                | Value                                                                          |
| -------------------- | ------------------------------------------------------------------------------ |
| Status               | Draft                                                                          |
| Type                 | Module Work Unit                                                               |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                              |
| Related architecture | [Admin and cells](../../../architecture/admin-cells.md)                        |
| Related PRDs         | [M0001-05](M0001-05-authorization.md), [M0001-06](M0001-06-cell-management.md) |
| Related decisions    | Central tenant creation does not require cell assignment                       |
| Last reviewed        | 2026-09-20                                                                     |

## 2. Purpose

Create a central tenant before cell assignment and provisioning.

## 3. Scope

### Included

- Tenant metadata validation and central creation.
- Idempotent and concurrent-create handling.
- A response that reports central state only.

### Excluded

- Table definitions and migrations.
- Cell assignment, projection, provisioning, and activation.
- Tenant update, suspension, archive, and restore operations.

## 4. Actors And Permissions

| Actor                    | Authority                       | Result                      |
| ------------------------ | ------------------------------- | --------------------------- |
| Root or `platform_admin` | `admin-tenancy::control::write` | Create a tenant             |
| `support`                | Same capability                 | Create a non-Napsoft tenant |
| Other caller             | None                            | Deny                        |

Only bootstrap may create a tenant with `is_napsoft = true`.

## 5. Concepts And Terminology

| Term            | Meaning                                                |
| --------------- | ------------------------------------------------------ |
| Central tenant  | Tenant record that may not yet have a cell assignment  |
| Idempotency key | Client-generated UUID identifying one creation attempt |

## 6. Functional Requirements

- M0001-07-R001: Authorized creation must store the normalized code, name, tier, and initial central state and return the tenant UUID.
- M0001-07-R002: Creation must succeed without a cell assignment or cell-side record.
- M0001-07-R003: The response must report `pending`, unassigned, unprovisioned, and not RBAC-ready; it must not claim cell readiness.
- M0001-07-R004: Invalid, duplicate, repeated, and concurrent requests must not create unintended tenants.

## 7. Business Rules And Invariants

Tenant code is trimmed, uppercased, 2–32 characters, starts with a letter, and
contains only ASCII letters, numbers, and underscores. Name is trimmed and
contains 1–160 characters. Tier is `starter`, `growth`, or `enterprise`.

Creation sets `status = pending`, `cell_id = null`, `provisioned = false`,
`rbac_ready = false`, and `revision = 1`. A case-insensitive code conflict
returns `409 CONFLICT`.

Every request includes `Idempotency-Key` with a UUID. Repeating the same key and
payload returns the original `201` representation. Reusing the key with different
input returns `409 IDEMPOTENCY_CONFLICT`. Code uniqueness resolves concurrent
requests that use different keys.

## 8. Lifecycle And State Transitions

| Starting state                              | Action                    | Result                                    |
| ------------------------------------------- | ------------------------- | ----------------------------------------- |
| No matching code                            | Create                    | Pending central tenant with no cell       |
| Same idempotency key and payload            | Repeat                    | Original result                           |
| Existing code or changed idempotent payload | Create                    | Conflict; no new record                   |
| Pending tenant                              | Later assignment workflow | Assign only to an enabled registered cell |

## 9. Data Requirements

This Work Unit writes `admin.tenants`. M0001-00 defines the table, model, and
constraints.

## 10. API Requirements

```text
POST /api/admin-tenancy/v1/tenants
```

```json
{ "code": "ACME", "name": "Acme Construction", "tier": "starter" }
```

Success returns `201` with `id`, `code`, `name`, `tier`, `status`, `cellId`,
`provisioned`, and `rbacReady`. Validation returns `400`; unauthorized access
returns `403`; duplicates and idempotency conflicts return `409`.

The integrated registry command described by the admin/cell architecture is a
later application workflow. It calls this operation, then performs assignment;
it does not change the central creation contract.

## 11. Cross-Module Interactions

WU 6 supplies eligible cells to a later assignment workflow. Cell-tenancy and
provisioning own projection, provisioning, activation, and status synchronization.
That later tenant-provisioning workflow runs the all-tenant `tenant_admin` seed
from M0001-05 and the owner-only seed only for the configured owning tenant.
Central tenant creation does not seed roles or claim that provisioning is complete.

## 12. Security And Audit

- M0001-07-R005: Creation must require the control-write capability and must return only safe central metadata.

Success, denial, validation failure, and conflict record managed events without
request headers or secrets. Success advances the tenant-list cache revision.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                      | Requirements                 |
| --------- | ---------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | Valid authorized input creates the normalized pending tenant and returns its UUID.                   | M0001-07-R001, M0001-07-R005 |
| AC02      | Creation succeeds without a cell and reports no provisioning or readiness.                           | M0001-07-R002, M0001-07-R003 |
| AC03      | Invalid, duplicate, repeated, and concurrent requests follow the stated outcomes without duplicates. | M0001-07-R004                |
| AC04      | Support cannot create or designate the Napsoft tenant.                                               | M0001-07-R005                |

## 14. Outstanding Questions

None.
