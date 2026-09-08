# 0005 — Core identity records

**Design:** Accepted (owner approved, 2026-09-08).
**Implementation:** Implemented (working tree; Verified upon merge with required checks passing).

## Authority

Implements ARCH-006, ARCH-013 through ARCH-020, ARCH-040, ARCH-044, ARCH-047,
and ARCH-049. PRD 0004 owns portal identities and membership provisioning.

## Requirements

- **CID-001 Records.** Core owns app.employees, app.clients, app.vendors and
  app.vendor_contacts. The minimal records have tenant id, immutable id, code,
  display name, email where applicable, and application-user flag. Vendor
  contacts link a same-tenant vendor through a composite foreign key.
- **CID-002 Isolation.** Every table uses tenant-inclusive keys, immutable tenant
  id, audit columns, soft deletion, and runtime-role RLS. Tenant reads and writes
  always use withTenantTransaction, including provisioning service work.
- **CID-003 Identity workflow.** Provisioning preallocates record identifiers and
  idempotently writes these records before enabling the corresponding membership.
  A vendor membership identifies a vendor contact, not a company. Root has no Core
  record. Broader contacts, payment terms, HR, and commercial workflows are deferred.
- **CID-004 Access.** The initial tenant endpoint lets an ordinary member read
  its own linked record. Controlled operators can read target records under the
  separately audited permission. General business editing waits for Core RBAC.

## Physical tables and seed boundary

Each table follows the Tenant mutable profile. IDs are preallocated by the
provisioning workflow and have no generated model default (PRD 0004); timestamps
and immutable tenant keys have database triggers. Each table has unique live
`(tenant_id, code)` and `UNIQUE (tenant_id, id)`.

| Table             | Required nonstandard columns                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `employees`       | code, name, email (text); is_app_user boolean                                                  |
| `clients`         | code, name, email (text); is_app_user boolean                                                  |
| `vendors`         | code and name (text)                                                                           |
| `vendor_contacts` | code, name, email (text); is_app_user boolean; vendor_id uuid with indexed tenant-inclusive FK |

The initial workflow creates one vendor record per provisioned vendor contact;
consolidating contacts under an existing commercial vendor waits for the broader
vendor workflow. Codes are stable record UUID strings in this initial slice.
The required one-cell seed state is its tenant and membership projection plus
the confirmed initial employee; no unrelated business configuration is invented.

## Acceptance

Prove same-tenant vendor relationships, negative cross-tenant reads and writes,
immutable keys, replay-safe provisioning, and absence of business data in admin.

## Revisions

| Date       | Change                                                      |
| ---------- | ----------------------------------------------------------- |
| 2026-09-08 | Accepted minimal Core records brought forward for PRD 0004. |

| 2026-09-08 | Completed implementation and local acceptance checks; merge and CI remain pending. |
