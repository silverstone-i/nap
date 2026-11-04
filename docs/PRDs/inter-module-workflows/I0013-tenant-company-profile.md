# I0013: Tenant Company Profile

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Type                 | Inter-module workflow                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Related architecture | [Admin and cells](../../architecture/admin-cells.md)                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Related PRDs         | [I0006: Tenant Provisioning](I0006-tenant-provisioning.md), [I0004: Admin-Cell Sync](I0004-admin-cell-sync.md), [I0008: Portal Access](I0008-portal-access.md), [I0005: RBAC Decision Model](I0005-rbac-decision-model.md), [M0001: Admin Tenancy](../modules/M0001-admin-tenancy.md), [M0002: Cell Tenancy](../modules/M0002-cell-tenancy.md), [M0003: Access Control](../modules/M0003-access-control.md), [M0005: Business Directory](../modules/M0005-business-directory.md) |
| Related decisions    | Every Napsoft client is a tenant. The tenant owns its primary and billing contacts and its tax ID; Napsoft owns the legal and DBA name and approves tax IDs. Napsoft client contacts never have portal access. One client never holds more than one tenant. Reverses the v0.26.0 rule that only organization contacts carry the primary and billing flags.                                                                                                                       |
| Last reviewed        | 2026-11-01                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## 2. Purpose

Napsoft bills each customer tenant and needs to know who to contact there.
Today Napsoft keeps its own contacts on each client record. They go stale
when the tenant edits its own people, and they can be given portal access to
the Napsoft tenant. This workflow makes the tenant the owner of its primary
contacts, its billing contact, and its tax ID. Napsoft sees a copy of the
contacts on the client record, approves tax ID changes, and keeps the legal
and DBA name, which flow to the tenant.

## 3. Scope

### Included

- Provisioning that creates the Napsoft client and the tenant from one form.
- Primary and billing contact flags on a customer tenant's employees, and the
  rules that keep at least one primary contact and exactly one billing
  contact.
- Copying those contacts to the admin database, and showing the copy on the
  Napsoft client record.
- Carrying the legal and DBA name from the Napsoft client to the tenant.
- Tax ID submission by the tenant and approval or rejection by Napsoft.
- The rule that archiving a tenant archives its Napsoft client.

### Excluded

- Tenant suspend, archive, and reinstate themselves (I0006 §3, I0008 §3).
- One client holding several tenants, and billing several tenants together.
- Invoicing and payment.
- Collecting or storing a W-9; the approval permission is the control.
- Primary and billing flags on vendor and client contacts in customer
  tenants, which stay as M0005-R004 defines them.

## 4. Actors And Permissions

| Context                                                        | Actor            | Required permission                                    | Required state                   | Result                                   |
| -------------------------------------------------------------- | ---------------- | ------------------------------------------------------ | -------------------------------- | ---------------------------------------- |
| Provision a tenant                                             | Napsoft operator | `NAP::admin-tenancy::control::write`                   | Code and cell valid (I0006-R001) | Client and tenant created (R001–R003)    |
| View the company profile                                       | Tenant user      | `<TENANT>::business-directory::directory::read`        | Customer tenant                  | Names, tax ID status, contacts (R026)    |
| Flag or unflag a primary contact                               | Tenant user      | `<TENANT>::business-directory::company-profile::write` | R010–R013 hold after the change  | Flag saved; copy queued (R015)           |
| Reassign the billing contact                                   | Tenant user      | `<TENANT>::business-directory::company-profile::write` | New contact meets R011           | Flag moved in one transaction (R012)     |
| Submit a tax ID                                                | Tenant user      | `<TENANT>::business-directory::company-profile::write` | Customer tenant                  | Pending request (R019)                   |
| Archive the billing or last primary contact                    | Tenant user      | `<TENANT>::business-directory::directory::write`       | —                                | `409`, record unchanged (R013)           |
| View a client's contacts                                       | Napsoft operator | `NAP::admin-tenancy::control::read`                    | Client has a tenant              | Read-only copy (R017)                    |
| Approve or reject a tax ID                                     | Napsoft user     | `NAP::business-directory::tax-ids::approve`            | Request is pending               | Decision applied (R022, R023)            |
| Edit a client's legal or DBA name                              | Napsoft user     | `NAP::business-directory::directory::write`            | Client active                    | Name saved; carried to the tenant (R006) |
| Create a contact on, or set a Napsoft client's tax ID directly | Any              | —                                                      | Napsoft tenant                   | `409 INVALID_STATE` (R018, R025)         |

`company-profile::write` and `tax-ids::approve` are new capabilities (R027).
A tenant's `tenant_admin` holds them through its `<CODE>::*::*::*` grant.

## 5. Concepts And Terminology

| Term            | Meaning                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Customer tenant | Any tenant other than Napsoft (`is_napsoft = false`)                                                                       |
| Napsoft client  | A `client` organization in the Napsoft tenant's directory; each one belongs to exactly one customer tenant (`client_id`)   |
| Primary contact | An active employee of a customer tenant with `is_primary_contact = true`                                                   |
| Billing contact | The one active employee of a customer tenant with `is_billing_contact = true`                                              |
| Billing phone   | A phone labeled `billing` (M0005-R017)                                                                                     |
| Contact copy    | A row of `admin.tenant_contacts` holding one primary or billing contact as the tenant last saved it                        |
| Tax ID request  | A tax ID the tenant submitted, waiting for Napsoft's decision; held in the tenant cell and copied to admin                 |
| Display name    | The DBA name when set, otherwise the legal name; what pickers, headers, and the Tenants screen show (`admin.tenants.name`) |

## 6. Functional Requirements

### Provisioning

- I0013-R001: `tenant-provision` (I0006-R001) must take
  `{ "operation": "tenant-provision", "legalName": "...", "dbaName": "...", "code": "...", "tier": "...", "cell": "<uuid>", "admin": { "email": "...", "phone": "...", "password": "...", "firstName": "...", "lastName": "..." } }`
  in place of `client` and `name`. `dbaName` is optional; every other field
  is required. The phone is validated as M0005 validates phones.
- I0013-R002: In the admin transaction that creates the tenant, the request
  must generate the client's party ID and store it as `client_id`, store
  `legal_name` and `dba_name`, and set `name` to the display name. Code and
  cell checks and idempotency stay as I0006-R001 and R003 define them.
- I0013-R003: A new **client** stage must run before assignment. In one
  Napsoft-cell transaction it creates the client party and organization with
  the generated ID, the legal name, the DBA name, and no tax ID. It must be
  safe to rerun (I0006-R009). An unreachable Napsoft cell fails the stage with
  `CELL_UNAVAILABLE`, and `tenant-retry` resumes it.
- I0013-R004: The seed stage (I0006-R007, M0005-R022) must also store the
  administrator's phone as the primary phone with the `billing` label, and
  set `is_primary_contact` and `is_billing_contact` on the administrator. The
  readback check covers these values. The tenant's default labels must
  include a `billing` label for phones (M0005-R017 seeds `billing` for
  addresses only). In a customer tenant, renaming or archiving that phone
  label fails with `409 BILLING_LABEL`, since R011 finds the billing phone
  by it. _Superseded in part by I0014-R032 ([I0014](I0014-contact-roles-and-address-purposes.md): roles in place of the
  flags; no billing phone or `BILLING_LABEL`)._
- I0013-R005: A Napsoft client must be created only by R003. In the Napsoft
  tenant, `POST /organizations` with `kind = client` fails with
  `409 INVALID_STATE`, and the Clients screen offers no **New client**. The
  Provision tenant dialog moves to the Tenants screen and asks for the R001
  fields.

### Legal and DBA name

- I0013-R006: Only Napsoft edits a client's legal and DBA name, through the
  existing organization edit. The edit must write, in the same Napsoft-cell
  transaction, an outbox row naming the customer tenant and the new names.
- I0013-R007: Applying that row must update `admin.tenants.legal_name`,
  `dba_name`, and `name`, and advance the tenant's `revision`, so the
  existing tenant row of I0004 carries the names to `cell.tenants`. Nothing
  else writes these columns after provisioning.
- I0013-R008: The tenant must see its legal and DBA name read-only on the
  company profile (R026).

### Primary and billing contacts

- I0013-R009: In a customer tenant, an active employee may carry
  `is_primary_contact`, `is_billing_contact`, or both. Setting or clearing
  either flag on an employee requires `business-directory::company-profile::write`.
  The Napsoft tenant's employees never carry either flag. _Superseded by
  I0014-R003 and R005 ([I0014](I0014-contact-roles-and-address-purposes.md))._
- I0013-R010: A customer tenant must always have at least one primary
  contact and exactly one billing contact. _Superseded by I0014-R006 ([I0014](I0014-contact-roles-and-address-purposes.md):
  at least one of each role)._
- I0013-R011: A primary contact must have a primary email and a primary
  phone. The billing contact must have a primary email and a billing phone.
  _Superseded by I0014-R008 ([I0014](I0014-contact-roles-and-address-purposes.md))._
- I0013-R012: `POST /company-profile/billing-contact` with
  `{ "partyId": "<uuid>" }` must, in one cell transaction, clear the flag on
  the current billing contact and set it on the named employee. The named
  employee must meet R011, or the request fails with
  `409 CONTACT_DETAILS_REQUIRED`. _Superseded by I0014-R011 and R031
  ([I0014](I0014-contact-roles-and-address-purposes.md): the endpoint is removed)._
- I0013-R013: A change that would break R010 or R011 must fail and change
  nothing:
  - archiving or unflagging the last primary contact: `409 LAST_PRIMARY_CONTACT`;
  - archiving the billing contact, or clearing its flag outside R012:
    `409 BILLING_CONTACT`;
  - removing a contact's required email or phone, or the `billing` label from
    the billing phone: `409 CONTACT_DETAILS_REQUIRED`.

  Bulk archive reports these codes per item (M0005 §10). _Superseded by
  I0014-R007 and R010 ([I0014](I0014-contact-roles-and-address-purposes.md))._

- I0013-R014: Primary and billing contacts may hold portal access under
  I0008, as any employee may.

### Contact copy

- I0013-R015: Any committed change to a primary or billing contact's flags,
  first or last name, primary email, primary phone, billing phone, or
  archived state must write, in the same cell transaction, an outbox row
  holding the employee's snapshot. Clearing both flags writes a removal row.
  _Superseded in part by I0014-R026 ([I0014](I0014-contact-roles-and-address-purposes.md): roles in place of the flags)._
- I0013-R016: The cell-to-admin delivery (I0004) must upsert the snapshot
  into `admin.tenant_contacts`, or delete the row for a removal, applying a
  row only when its `revision` is higher than the stored one.
- I0013-R017: The Napsoft client record must list the tenant's contacts from
  `admin.tenant_contacts` through `GET /tenants/:tenant/contacts`, with name,
  email, phone, billing phone, and contact type. The list is read-only and
  has no portal column, portal actions, or **New contact**. _Superseded in
  part by I0014-R027 ([I0014](I0014-contact-roles-and-address-purposes.md): **Roles** column, no billing phone)._

### Napsoft client contacts

- I0013-R018: In the Napsoft tenant, creating a contact on a client must
  fail with `409 INVALID_STATE`, and any write that sets `isPortalUser: true`
  on a client contact must fail with `409 INVALID_STATE`.

### Tax ID

- I0013-R019: `POST /company-profile/tax-id` with `{ "taxId": "...", "taxIdFormatId": "<uuid>" }`
  must validate the value as M0005 validates tax IDs and, in one cell
  transaction, store it as the tenant's pending tax ID and write an outbox
  row with the encrypted value, the last four digits, and the format's
  country. A new submission replaces a pending one.
- I0013-R020: Applying that row must upsert the tenant's request in
  `admin.tenant_tax_id_requests` with status `pending`. Tax IDs move between
  databases only as ciphertext. Encryption is bound to the row it protects,
  so the request is encrypted for the tenant's request and approval
  decrypts it and encrypts it again for the Napsoft client (R022); every
  database in an environment uses the same `TAX_ID_ENCRYPTION_KEY_<ENV>`.
- I0013-R021: While a request is pending or after it is rejected, the
  tenant's approved tax ID, if any, stays in effect. The company profile
  shows the approved last four digits and "Pending approval" or "Rejected:
  {reason}".
- I0013-R022: `POST /organizations/:id/tax-id-request/approve` in the Napsoft
  tenant must write an outbox row recording the decision, carrying the
  pending value encrypted for the client in the Napsoft tenant's active
  format for the request's country. With no active format for that country
  it fails with `409 INVALID_STATE`; when another client holds the value it
  fails with `409 DUPLICATE_TAX_ID`. The client's tax ID changes only when
  the tenant's cell has applied the decision (R024), so an approval of a
  request the tenant has since replaced changes nothing.
- I0013-R023: `POST /organizations/:id/tax-id-request/reject` with
  `{ "reason": "..." }` must record the rejection in the same way and leave
  the client's tax ID unchanged.
- I0013-R024: The decision must reach the tenant through admin: the
  Napsoft-cell row updates the request's status, and an admin-to-cell row
  then makes the pending value the tenant's approved tax ID, or marks it
  rejected with the reason. A decision on a request that is no longer
  pending, in admin or in the tenant's cell, fails with
  `REQUEST_SUPERSEDED` and changes nothing. For an approval, the tenant's
  cell confirms that it applied the value with a cell-to-admin
  `tax_id_applied` row; only then does admin send the client's tax ID to
  the Napsoft cell. If another client holds that tax ID by then, the row
  fails with `DUPLICATE_TAX_ID` and the client's tax ID is unchanged.
- I0013-R025: In the Napsoft tenant, a create or edit that sets a client's
  `taxId` must fail with `409 INVALID_STATE`; only R022 sets it.

### Screens and capabilities

- I0013-R026: Customer tenants must have a **Company** screen under Settings
  that shows the legal and DBA name, the tax ID status with a submit action,
  the primary contacts, and the billing contact with a **Change** action.
  Actions the session cannot perform are hidden (I0005). _Superseded in part
  by I0014-R031 ([I0014](I0014-contact-roles-and-address-purposes.md): three role groups, no **Change**)._
- I0013-R027: The capability catalogue must add
  `business-directory::company-profile::write` for customer tenants and
  `business-directory::tax-ids::approve` for the Napsoft tenant.
- I0013-R028: An employee's detail in a customer tenant must show
  **Primary contact** as a switch and the billing flag as text, with **Change
  billing contact** linking to R012 (M0005-R051's pattern). _Superseded by
  I0014-R028 ([I0014](I0014-contact-roles-and-address-purposes.md))._
- I0013-R029: The Napsoft client detail must show a pending tax ID's last
  four digits with **Approve** and **Reject**, using the request from
  `GET /tenants/:tenant/tax-id-request`.

### Lifecycle and rollout

- I0013-R030: Archiving a customer tenant must archive its Napsoft client in
  the same flow. Until tenant archive exists, archiving a Napsoft client
  whose tenant is active fails with `409 INVALID_STATE`.
- I0013-R031: Schema changes edit each module's `001-*.js` baseline
  migration in place. A one-time script updates existing development
  databases: it adds the new columns and tables, sets each customer tenant's
  first administrator as its primary and billing contact, and fills
  `admin.tenant_contacts` and the tenant names. R011 applies to later edits;
  the script does not invent missing phones.

## 7. Business Rules And Invariants

- A customer tenant has at least one primary contact and exactly one billing
  contact (R010). The billing rule is a database constraint in the cell: at
  most one active employee per tenant with `is_billing_contact`.
- `admin.tenant_contacts`, `admin.tenants.legal_name`, `dba_name`, and `name`,
  and `admin.tenant_tax_id_requests` are written only by sync delivery and by
  provisioning (R002, R007, R016, R020).
- The databases never query each other. Every change crosses through an
  outbox row and the I0004 worker (R006, R015, R019, R022).
- A Napsoft client's tax ID changes only through an approved request (R025).

## 8. Lifecycle And State Transitions

Tax ID request, as the tenant sees it:

| State      | Event                | Result                                             |
| ---------- | -------------------- | -------------------------------------------------- |
| None       | Tenant submits       | `pending`                                          |
| `pending`  | Tenant submits again | `pending` with the new value                       |
| `pending`  | Napsoft approves     | Value becomes the approved tax ID; request cleared |
| `pending`  | Napsoft rejects      | `rejected` with reason; approved tax ID unchanged  |
| `rejected` | Tenant submits       | `pending`                                          |

Billing contact: Ann is billing → `POST /company-profile/billing-contact`
names Billy → Billy is billing and Ann is not, in one transaction → Ann may
now be archived if she is not the last primary contact.

## 9. Data Requirements

- `admin.tenants`: new `legal_name` (not null) and `dba_name` (nullable);
  `name` keeps its role as the display name (R002, R007).
- New `admin.tenant_contacts`: `tenant_id`, `party_id`, `first_name`,
  `last_name`, `email`, `phone`, `billing_phone`, `is_primary_contact`,
  `is_billing_contact`, `revision`; key (`tenant_id`, `party_id`).
- New `admin.tenant_tax_id_requests`: `tenant_id` (key), `tax_id_encrypted`,
  `tax_id_last4`, `country`, `status` (`pending`, `approved`, `rejected`),
  `reason`, `revision`.
- `cell.tenants`: new `legal_name`, `dba_name`, and `name`, carried by the
  existing tenant row.
- `app.people`: the flags no longer require `organization_id`; a check limits
  them to employees and organization contacts, and a partial unique index
  enforces one active billing employee per tenant.
- New `app.tenant_tax_ids` (Business Directory): one row per customer
  tenant with the approved encrypted value, last four digits, and format, and
  the pending value, status, and reason.

## 10. API Requirements

Business Directory, base `/api/business-directory/v1`:

| Method and route                                    | Route capability                             | Errors                                                                     |
| --------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| `GET /company-profile`                              | `business-directory::directory::read`        | `INVALID_STATE` in the Napsoft tenant                                      |
| `POST /company-profile/billing-contact`             | `business-directory::company-profile::write` | `NOT_FOUND`, `CONTACT_DETAILS_REQUIRED`                                    |
| `POST /company-profile/tax-id`                      | `business-directory::company-profile::write` | `INVALID_INPUT`                                                            |
| `POST /organizations/:id/tax-id-request/approve`    | `business-directory::tax-ids::approve`       | `NOT_FOUND`, `INVALID_STATE`                                               |
| `POST /organizations/:id/tax-id-request/reject`     | `business-directory::tax-ids::approve`       | `NOT_FOUND`, `INVALID_INPUT`                                               |
| `PATCH /people/:id`, archive, contact-method writes | As M0005 §10                                 | Adds `LAST_PRIMARY_CONTACT`, `BILLING_CONTACT`, `CONTACT_DETAILS_REQUIRED` |
| Rename or archive the `billing` phone label         | As M0005 §10                                 | Adds `BILLING_LABEL`                                                       |

`GET /company-profile` returns
`{ legalName, dbaName, taxId: { last4, status, reason }, primaryContacts: [...], billingContact }`.

Admin Tenancy, base `/api/admin-tenancy/v1`:

| Method and route                      | Route capability                    | Errors      |
| ------------------------------------- | ----------------------------------- | ----------- |
| `GET /tenants/:tenant/contacts`       | `NAP::admin-tenancy::control::read` | `NOT_FOUND` |
| `GET /tenants/:tenant/tax-id-request` | `NAP::admin-tenancy::control::read` | `NOT_FOUND` |
| `POST /control/provision`             | As I0006, with the R001 body        | As I0006    |

## 11. Cross-Module Interactions

- I0006: provisioning takes the R001 body, gains the client stage (R003), and
  seeds the contact flags and phone (R004).
- I0004: three new cell-to-admin rows (contact snapshot, Napsoft name change,
  tax ID decision and submission) and one admin-to-cell row (tax ID
  decision); the tenant row carries the names.
- M0001: `admin.tenants` gains the name columns; two new tables (R007, §9).
- M0002: `cell.tenants` gains the name columns.
- M0003: two new catalogue capabilities (R027).
- M0005: flags on employees (R009), the guards (R013), the tax ID table, and
  the Napsoft-only refusals (R005, R018, R025).
- I0008: unchanged for tenants; the Napsoft refusal (R018) runs before any
  portal-access request is written.

## 12. Security And Audit

- Approving or rejecting a tax ID, submitting one, and reassigning the
  billing contact each record an administrative event (M0001-12) with the
  actor and tenant, never the full tax ID.
- Tax IDs leave a cell only as ciphertext and last four digits (R020).
- Napsoft reads tenant contacts only from the admin copy; it gains no read
  access to the tenant's directory.
- No Napsoft client contact can hold portal access (R018), so a customer's
  people never reach the Napsoft tenant.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                               | Requirements           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| AC01      | Provisioning "Oak Homes LLC", DBA "Oak Homes", with Ann's phone creates the Napsoft client and the tenant; Ann is an employee with portal access, primary and billing.        | I0013-R001–R004        |
| AC02      | With the Napsoft cell down, provisioning fails at the client stage with `CELL_UNAVAILABLE`; retry after it returns completes without duplicates.                              | I0013-R003             |
| AC03      | In the Napsoft tenant, creating a client directly, adding a contact to a client, or setting a client's tax ID returns `409 INVALID_STATE`.                                    | I0013-R005, R018, R025 |
| AC04      | Ann adds a mobile phone in Oak's tenant; the Napsoft client record shows it after delivery, read-only, with no portal column.                                                 | I0013-R015–R017        |
| AC05      | Archiving Ann while she is billing returns `BILLING_CONTACT`; after reassigning billing to Billy, Ann is still the last primary and archiving returns `LAST_PRIMARY_CONTACT`. | I0013-R012, R013       |
| AC06      | Reassigning billing to an employee with no billing phone returns `CONTACT_DETAILS_REQUIRED` and leaves Ann as billing.                                                        | I0013-R011, R012       |
| AC07      | A user without `company-profile::write` cannot flag a contact, change billing, or submit a tax ID.                                                                            | I0013-R009, R027       |
| AC08      | Oak submits a tax ID: Oak shows "Pending approval"; a Napsoft clerk with `tax-ids::approve` approves it; Napsoft's client and Oak's profile show the new last four.           | I0013-R019–R022, R024  |
| AC09      | A rejected request shows "Rejected: {reason}" to Oak, and Oak's previous tax ID stays in effect.                                                                              | I0013-R021, R023, R024 |
| AC10      | Napsoft renames the DBA to "Oak Builders"; the sign-in picker and Oak's company profile show it.                                                                              | I0013-R006–R008        |
| AC11      | Archiving the Napsoft client of an active tenant returns `409 INVALID_STATE`.                                                                                                 | I0013-R030             |

## 14. Outstanding Questions

None blocking. For review: the reject path (R023) and the capability names
`company-profile::write` and `tax-ids::approve` (R027) are defaults chosen in
drafting.

## Verification Evidence

Verified on 2026-11-02 in
[silverstone-i/nap#88](https://github.com/silverstone-i/nap/pull/88).

- `npm run lint`, `npm run format:check`, and `npm run build` pass.
  `npm test` passes: API unit 641, web 342, shared 25, toolchain 25.
  `npm run test:db:local` passes 356, including provisioning with the
  client stage and its retry (AC01, AC02), the Napsoft refusals (AC03), the
  contact copy (AC04), billing reassignment and the contact rules (AC05,
  AC06), tax ID approval, rejection, and a refused second decision on one
  request (AC08, AC09), a Napsoft rename reaching the tenant (AC10), and
  archiving a client with an active tenant refused (AC11). AC07 is covered
  by unit tests.
- On a recreated dev stack: root provisioned Oak Homes LLC (DBA Oak Homes)
  and Pine Homes LLC from the Tenants screen; Pine's client record listed
  Pat Pine read-only with phone and billing phone, no portal column, and no
  New contact, and Clients offered no New client. As Oak's administrator,
  Settings → Company showed both names and Ann as primary and billing
  contact; a submitted tax ID showed "pending approval"; removing Ann's
  billing phone was refused; adding a mobile phone reached Napsoft's copy.
  As root, the client showed the pending tax ID, Approve set
  `••-•••0001` on the client and Oak's approved tax ID, and renaming the DBA
  to Oak Builders changed the Tenants list and Oak's `cell.tenants` names.
- The dev check found two gaps, fixed here: provisioning did not queue the
  administrator's contact copy, and a decided request could be decided again
  before the sync delivered the first decision.
- Review rounds on #88 changed the tax ID approval: the Napsoft client takes
  the tax ID only after the tenant's cell applies the approval and confirms
  it (`tax_id_applied`), a stale decision fails as `REQUEST_SUPERSEDED`, and
  a redelivered one is delivered. They also guard the `billing` phone label
  (`BILLING_LABEL`), enforce the contact rules on restore, and serialize
  billing changes. DB tests cover the stale and redelivered decisions, the
  wrong-client refusal, the label guard, and restore.
