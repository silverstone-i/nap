# M0001-07: Tenant Creation

## 1. Document Control

| Field                | Value                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Accepted                                                                                                                        |
| Type                 | Module Work Unit                                                                                                                |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                               |
| Related architecture | [Admin and cells](../../../architecture/admin-cells.md)                                                                         |
| Related PRDs         | [M0001-05](M0001-05-authorization.md), [M0001-06](M0001-06-cell-management.md), [W0005](../../workflows/W0005-portal-access.md) |
| Related decisions    | Central tenant creation does not require cell assignment                                                                        |
| Last reviewed        | 2026-09-20                                                                                                                      |

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

| Actor                         | Authority                       | Result                      |
| ----------------------------- | ------------------------------- | --------------------------- |
| Root user or `platform_admin` | `admin-tenancy::control::write` | Create a tenant             |
| `support`                     | Same capability                 | Create a non-Napsoft tenant |
| Other caller                  | None                            | Deny                        |

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

### Amendments From W0005

These rules take effect when [W0005: Portal Access](../../workflows/W0005-portal-access.md) is implemented; until then the rules above apply.

- Amended by W0005 (W0005-R008, W0005-R009): tenants can be suspended, archived, and reinstated by root, `platform_admin`, or `support`. Suspension or archiving turns every user's portal access off and suspends every membership; reinstatement leaves access off until Napsoft provisions a `tenant_admin`.

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

### Verification Evidence

Local validation on 2026-09-20: `npm run lint`, `npm run format:check`,
`npm test` (306 tests across the workspace, including 12 new unit tests),
`npm run build`, and `npm run licenses` passed.

`npm run test:db` passed 122 of 125 tests against a disposable local
PostgreSQL 18 server, including all 8
[tenant-creation tests](../../../../apps/api/tests/integration/tenant-creation.test.js).
The three failures are in `admin-foundation.test.js` and predate this Work
Unit, as recorded in [M0001-12's verification evidence](M0001-12-administrative-events.md#verification-evidence):
the local fixture server has no `postgres` superuser role and authenticates
with `trust`, so its two wrong-password cases still connect. Neither touches
`admin.tenants`.

Integration tests cover a valid, authorized, normalized creation with no
cell, no provisioning, and no RBAC readiness, and its recorded
`tenant.created` event and `{tenant, list}` cache-revision advance (AC01,
AC02); invalid input and a client-supplied `is_napsoft` each rejected
without creating a row, advancing the revision, or claiming an
`Idempotency-Key` (AC03); a denied actor recording a `denied` event; a
case-insensitive duplicate code reported as a conflict; a repeated
`Idempotency-Key` and payload returning the original `201` representation
without a second insert; a reused key with a different payload reported as
`IDEMPOTENCY_CONFLICT` without disturbing the original row; and two
concurrent requests, both sharing one key resolving to a single tenant and
both sharing a code under different keys resolving through code uniqueness
to exactly one success and one conflict (AC03). Unit tests cover
code/name/tier normalization and rejection, the required `Idempotency-Key`
header, the `tenantView` camelCase mapping, and the route's session,
capability, and error-shape gating over an in-memory admin handle.

As `control.js` already notes for cell management, `authorization.js`
currently resolves only root or no platform authority (M0001-05's
role-based `platform_admin`/`support` remains deferred), so AC04 is
demonstrated today by `is_napsoft` never being an acceptable request field
for any actor — root included — rather than by a distinguishable `support`
session, which has no runtime path to authenticate as yet.

## 14. Outstanding Questions

None.
