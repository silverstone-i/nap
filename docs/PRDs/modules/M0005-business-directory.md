# M0005: Business Directory

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                                                                                                                                                                                                                                                           |
| Type                 | Module                                                                                                                                                                                                                                                                                                                                                                |
| Related architecture | [Module map](../../architecture/module-map.md), [Migrations](../../architecture/migrations.md)                                                                                                                                                                                                                                                                        |
| Related PRDs         | [M0002-01: Cell Database Foundation](M0002-cell-tenancy/M0002-01-cell-database-foundation.md), [M0003: Access Control](M0003-access-control.md), [M0004: Reference Data](M0004-reference-data.md), [I0004: Admin-Cell Sync](../inter-module-workflows/I0004-admin-cell-sync.md), [I0006: Tenant Provisioning](../inter-module-workflows/I0006-tenant-provisioning.md) |
| Related decisions    | Roles stay in `access-control` and attach to logins; the directory stores people and organizations, not permissions                                                                                                                                                                                                                                                   |
| Last reviewed        | 2026-09-29                                                                                                                                                                                                                                                                                                                                                            |

## 2. Purpose

Later modules need to know who a tenant works with. `business-directory` stores
the tenant's employees, contacts, vendors, clients, and the people at each
vendor and client, with their emails, phones, and addresses. It also records
the tenant's primary and billing contacts. Provisioning a tenant creates the
first administrator as an employee and as the tenant's first primary contact.

## 3. Scope

### Included

- Employees, contacts, vendors, clients, vendor contacts, and client contacts.
- Emails, phones, and addresses for any directory record, with user-defined labels.
- Tax IDs on people, vendors, clients, and client contacts.
- The tenant's primary and billing contacts.
- The `is_portal_user` flag on people, vendor contacts, and client contacts.
- Creating the first administrator's employee record during tenant provisioning.
- Directory screens.

### Excluded

- Creating, suspending, or linking logins when `is_portal_user` changes: Portal
  Access (roadmap 14). This module stores the flag only.
- Roles and role assignments: M0003.
- Legal entities and tax registrations of the tenant itself: Companies (roadmap 15).

## 4. Actors And Permissions

| Required capability                                    | Allows                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| `<TENANT>::business-directory::directory::read`        | List and view directory records, labels, and tenant contacts |
| `<TENANT>::business-directory::directory::write`       | Create, edit, archive, and restore directory records         |
| `<TENANT>::business-directory::labels::write`          | Create, rename, archive, and restore labels                  |
| `<TENANT>::business-directory::tenant-contacts::write` | Add and remove primary and billing contacts                  |
| `<TENANT>::business-directory::tax-ids::read`          | Read full tax IDs and search by tax ID                       |
| `<TENANT>::business-directory::tax-ids::write`         | Set, change, and clear tax IDs                               |

`tenant_admin` holds all six through `<CODE>::*::*::*` (M0003-R007).
`business-directory` is a foundation module: every tenant can use it, with no
entitlement row (M0001-10), because provisioning creates its first rows
(R022).

## 5. Concepts And Terminology

| Term                 | Meaning                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| Party                | Any directory record: a person, an organization, or an organization contact                             |
| Person               | An employee or a contact                                                                                |
| Contact              | A person who is not an employee, such as an inspector or a lender                                       |
| Organization         | A vendor or a client                                                                                    |
| Organization contact | A person at a vendor (vendor contact) or at a client (client contact)                                   |
| Client               | The party the tenant sells to. In construction, the unit being sold; the buyers are its client contacts |
| Contact method       | One email or phone number of a party                                                                    |
| Label                | A tenant-defined category for a contact method or address, such as spouse, emergency, or billing        |
| Tenant contact       | An employee designated as the tenant's primary or billing contact                                       |
| Tax ID               | A Social Security Number (SSN) for a person or an Employer Identification Number (EIN) for a business   |

## 6. Functional Requirements

### Records

- M0005-R001: Every directory record must have one `app.parties` row with `kind` in `employee`, `contact`, `vendor`, `client`, `vendor_contact`, `client_contact`. `kind` never changes.
- M0005-R002: Employees and contacts are stored in `app.people`, each with a first name, last name, optional tax ID, and portal flag.
- M0005-R003: Vendors and clients are stored in `app.organizations`, each with a legal name, an optional "doing business as" name, and a tax ID or primary tax contact (R006, R007).
- M0005-R004: Vendor contacts and client contacts are stored in `app.organization_contacts`, each with a full name, optional tax ID, and portal flag. A vendor contact belongs to a vendor and a client contact to a client.
- M0005-R005: A party's child row must match its `kind`. For example, a `people` row may point only at an `employee` or `contact` party.

### Tax IDs

- M0005-R006: A vendor must have a tax ID and no primary tax contact.
- M0005-R007: A client must have exactly one of a tax ID or a primary tax contact. A business client uses its own EIN. A home buyer client names one of its own client contacts as primary tax contact, whose tax ID is then the client's primary tax ID.
- M0005-R008: A vendor contact must not have a tax ID. A client contact may.
- M0005-R009: A client has at most one primary tax contact, flagged on the contact itself. The flagged contact must have a tax ID and cannot be archived while flagged.
- M0005-R010: A tax ID is never stored in plain text. It is stored encrypted with AES-256-GCM (Advanced Encryption Standard in Galois/Counter Mode) using a fresh random value (nonce) per write, as an HMAC-SHA-256 keyed hash of its digits, and as its last four digits. The plain value must not appear in logs, outbox rows, or events.
- M0005-R011: The encryption key and the hash key come from deploy secrets `TAX_ID_ENCRYPTION_KEY_<ENV>` and `TAX_ID_HASH_KEY_<ENV>` and are never stored in a database. The API must refuse to start without them. Neither key rotates.
- M0005-R012: Responses show only `taxIdLast4`. Reading a full tax ID requires `business-directory::tax-ids::read` and writes an event recording who read which record. Setting, changing, or clearing a tax ID requires `business-directory::tax-ids::write`.
- M0005-R013: Searching by tax ID requires `business-directory::tax-ids::read`. The API hashes the entered digits and matches `tax_id_hash`. Saving a tax ID already held by another active record of the same table succeeds and returns `duplicateTaxIds` with those records' IDs, because one buyer can buy several units.

### Emails, phones, and addresses

- M0005-R014: Emails and phones are stored in `app.contact_methods`, each with an optional label. A party has at most one primary email and one primary phone.
- M0005-R015: Addresses are stored in `app.addresses`, each with an M0004 country code and an optional label. A party has at most one primary address.
- M0005-R016: An employee must have a primary email. Creating an employee requires one, and removing or demoting an employee's only primary email fails with `INVALID_STATE`.
- M0005-R017: Labels are stored in `app.contact_labels`. Each applies to emails, phones, or addresses, and its name is unique within that group. The tenant seed creates `work`, `home`, `mobile`, `spouse`, `emergency`, `billing`, and `location`.

### Tenant contacts

- M0005-R018: Tenant contacts are stored in `app.tenant_contacts` as `primary` or `billing`. Only an active employee may be a tenant contact. A tenant may have any number of each designation, and an employee holds each designation at most once.
- M0005-R019: Removing the last `primary` tenant contact, or archiving the employee who is the last one, must be rejected with `LAST_PRIMARY_CONTACT`.

### Portal flag

- M0005-R020: `is_portal_user` on a person or organization contact is stored and shown. It does not create or change a login until Portal Access exists.

### Provisioning

- M0005-R021: `tenant-provision` (I0006-R001) must also require the first administrator's `firstName` and `lastName`. It must generate the administrator's party ID and store it as the membership's `member_id` (I0006-R002).
- M0005-R022: The seed stage (I0006-R007) must, in the same cell transaction, create the employee party, the `people` row with `is_portal_user = true`, the login email as the primary email, the default labels (R017), and a `primary` tenant contact for that employee. The readback check covers these rows.
- M0005-R023: An active, ready membership with a `member_type` must have a `member_id`. This replaces I0006's rule that `member_id` may be null. The Napsoft root membership keeps `member_type` and `member_id` null and has no employee record; it is an emergency login for first setup and recovery. Napsoft staff who need an employee record get their own login with an `employee` membership. The Napsoft tenant therefore starts with no primary tenant contact; R019 only blocks removing the last one.
- M0005-R024: `member_type` values become `employee`, `contact`, `vendor_contact`, `client_contact` in `admin.portal_user_tenants`, `cell.tenant_members`, and the admin provisioning job kinds. `client` is removed, because the login belongs to the buyer, not the client.

### Events and screens

- M0005-R025: Every directory write must write a `cell.outbox` row in the same cell transaction. The sync worker (I0004) delivers it to admin, where it writes an administrative event with actor, tenant, record, and before and after values. Tax IDs appear in events only as their last four characters.
- M0005-R026: The web app must provide screens to list, search, view, create, edit, archive, and restore each record type; to manage a record's emails, phones, and addresses; to manage labels; and to manage tenant contacts. Actions the session cannot perform are hidden (I0005).

## 7. Business Rules And Invariants

- The database enforces the keys, checks, and unique indexes in section 9.
- The model layer enforces rules that span tables: R005, R008, R018's employee rule, and R019.

## 8. Lifecycle And State Transitions

| State    | Action                                 | Result                                           |
| -------- | -------------------------------------- | ------------------------------------------------ |
| —        | Create                                 | Active record                                    |
| Active   | Edit                                   | Changed; event written                           |
| Active   | Archive                                | Archived; its contact methods and addresses stay |
| Active   | Archive last primary tenant contact    | Reject `LAST_PRIMARY_CONTACT`                    |
| Active   | Archive a client's primary tax contact | Reject `PRIMARY_TAX_CONTACT`                     |
| Archived | Restore                                | Active                                           |

## 9. Data Requirements

All tables are in each tenant's cell in the `app` schema and follow the rules
for tenant business tables (M0002-01-R006). Every table also has the standard
audit fields, soft delete (`deactivated_at`), and `revision`. Row-level
security (RLS) limits each query to the session's tenant through `tenant_id`.

| Table                   | Schema object                | Behavior defined by    |
| ----------------------- | ---------------------------- | ---------------------- |
| `parties`               | `partiesSchema`              | R001, R005             |
| `people`                | `peopleSchema`               | R002, R010–R013        |
| `organizations`         | `organizationsSchema`        | R003, R006, R007, R010 |
| `organization_contacts` | `organizationContactsSchema` | R004, R008–R010        |
| `contact_methods`       | `contactMethodsSchema`       | R014, R016             |
| `addresses`             | `addressesSchema`            | R015                   |
| `contact_labels`        | `contactLabelsSchema`        | R017                   |
| `tenant_contacts`       | `tenantContactsSchema`       | R018, R019             |

### `app.parties`

One row per directory record.

| Column      | Type   | Rules                                                                                                 |
| ----------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `id`        | `uuid` | Primary key, default `gen_random_uuid()`; immutable                                                   |
| `tenant_id` | `uuid` | Not null; immutable; RLS column                                                                       |
| `kind`      | `text` | Not null; `employee`, `contact`, `vendor`, `client`, `vendor_contact`, or `client_contact`; immutable |

### `app.people`

One row per employee or contact.

| Column             | Type       | Rules                                                                           |
| ------------------ | ---------- | ------------------------------------------------------------------------------- |
| `party_id`         | `uuid`     | Primary key; references `parties.id`; immutable                                 |
| `tenant_id`        | `uuid`     | Not null; immutable; RLS column                                                 |
| `first_name`       | `text`     | Not null                                                                        |
| `last_name`        | `text`     | Not null                                                                        |
| `tax_id_encrypted` | `text`     | Base64 of nonce, authentication tag, and ciphertext (R010); null when no tax ID |
| `tax_id_hash`      | `char(64)` | Hex HMAC-SHA-256 of the digits (R010); null with `tax_id_encrypted`; indexed    |
| `tax_id_last4`     | `char(4)`  | Last four digits; null with `tax_id_encrypted`                                  |
| `is_portal_user`   | `boolean`  | Not null, default `false`                                                       |

### `app.organizations`

One row per vendor or client.

| Column             | Type       | Rules                                                                           |
| ------------------ | ---------- | ------------------------------------------------------------------------------- |
| `party_id`         | `uuid`     | Primary key; references `parties.id`; immutable                                 |
| `tenant_id`        | `uuid`     | Not null; immutable; RLS column                                                 |
| `legal_name`       | `text`     | Not null; for a home buyer client, the unit, such as `Lot 12, Maple Ridge`      |
| `dba_name`         | `text`     | Nullable                                                                        |
| `tax_id_encrypted` | `text`     | Base64 of nonce, authentication tag, and ciphertext (R010); null when no tax ID |
| `tax_id_hash`      | `char(64)` | Hex HMAC-SHA-256 of the digits (R010); null with `tax_id_encrypted`; indexed    |
| `tax_id_last4`     | `char(4)`  | Last four digits; null with `tax_id_encrypted`                                  |

### `app.organization_contacts`

One row per vendor contact or client contact.

| Column                   | Type       | Rules                                                                                                                |
| ------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `party_id`               | `uuid`     | Primary key; references `parties.id`; immutable                                                                      |
| `tenant_id`              | `uuid`     | Not null; immutable; RLS column                                                                                      |
| `organization_id`        | `uuid`     | Not null; references `organizations.party_id`; immutable                                                             |
| `full_name`              | `text`     | Not null                                                                                                             |
| `tax_id_encrypted`       | `text`     | Base64 of nonce, authentication tag, and ciphertext (R010); null when no tax ID                                      |
| `tax_id_hash`            | `char(64)` | Hex HMAC-SHA-256 of the digits (R010); null with `tax_id_encrypted`; indexed                                         |
| `tax_id_last4`           | `char(4)`  | Last four digits; null with `tax_id_encrypted`                                                                       |
| `is_portal_user`         | `boolean`  | Not null, default `false`                                                                                            |
| `is_primary_tax_contact` | `boolean`  | Not null, default `false`; client contacts only; unique per `organization_id` among active flagged rows (R007, R009) |

### `app.contact_methods`

One row per email or phone.

| Column       | Type      | Rules                                                                              |
| ------------ | --------- | ---------------------------------------------------------------------------------- |
| `id`         | `uuid`    | Primary key, default `gen_random_uuid()`; immutable                                |
| `tenant_id`  | `uuid`    | Not null; immutable; RLS column                                                    |
| `party_id`   | `uuid`    | Not null; references `parties.id`; immutable                                       |
| `type`       | `text`    | Not null; `email` or `phone`; immutable                                            |
| `value`      | `text`    | Not null; email lowercased and trimmed, phone as entered                           |
| `label_id`   | `uuid`    | Nullable; references `contact_labels.id` with a matching `applies_to`              |
| `is_primary` | `boolean` | Not null, default `false`; unique per `(party_id, type)` among active primary rows |

### `app.addresses`

One row per address.

| Column        | Type      | Rules                                                                      |
| ------------- | --------- | -------------------------------------------------------------------------- |
| `id`          | `uuid`    | Primary key, default `gen_random_uuid()`; immutable                        |
| `tenant_id`   | `uuid`    | Not null; immutable; RLS column                                            |
| `party_id`    | `uuid`    | Not null; references `parties.id`; immutable                               |
| `line1`       | `text`    | Not null                                                                   |
| `line2`       | `text`    | Nullable                                                                   |
| `city`        | `text`    | Not null                                                                   |
| `region`      | `text`    | Nullable; state or province                                                |
| `postal_code` | `text`    | Nullable                                                                   |
| `country`     | `char(2)` | Not null; M0004 country code                                               |
| `label_id`    | `uuid`    | Nullable; references `contact_labels.id` with `applies_to = address`       |
| `is_primary`  | `boolean` | Not null, default `false`; unique per `party_id` among active primary rows |

### `app.contact_labels`

One row per label.

| Column       | Type   | Rules                                                                  |
| ------------ | ------ | ---------------------------------------------------------------------- |
| `id`         | `uuid` | Primary key, default `gen_random_uuid()`; immutable                    |
| `tenant_id`  | `uuid` | Not null; immutable; RLS column                                        |
| `applies_to` | `text` | Not null; `email`, `phone`, or `address`; immutable                    |
| `name`       | `text` | Not null; unique per `(tenant_id, applies_to)`, archived rows included |

### `app.tenant_contacts`

One row per employee designation.

| Column        | Type   | Rules                                                                   |
| ------------- | ------ | ----------------------------------------------------------------------- |
| `id`          | `uuid` | Primary key, default `gen_random_uuid()`; immutable                     |
| `tenant_id`   | `uuid` | Not null; immutable; RLS column                                         |
| `party_id`    | `uuid` | Not null; references `people.party_id`; employee only (R018); immutable |
| `designation` | `text` | Not null; `primary` or `billing`; immutable                             |

`(party_id, designation)` is unique among active rows.

`cell.tenant_members.member_id` holds a `parties.id`. There is no cross-database foreign key.

## 10. API Requirements

Base: `/api/business-directory/v1`. Route capabilities omit the tenant part, which I0005 adds.

| Method and route                                                   | Route capability                             | Errors                                                          |
| ------------------------------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------- |
| `GET /people`, `/organizations`, `/organization-contacts`          | `business-directory::directory::read`        | —                                                               |
| `GET /{collection}/:id`                                            | `business-directory::directory::read`        | `NOT_FOUND`                                                     |
| `POST /{collection}`                                               | `business-directory::directory::write`       | `INVALID_INPUT`                                                 |
| `PATCH /{collection}/:id`                                          | `business-directory::directory::write`       | `INVALID_INPUT`, `STALE_REVISION`                               |
| `POST /{collection}/:id/archive`, `/restore`                       | `business-directory::directory::write`       | `STALE_REVISION`, `LAST_PRIMARY_CONTACT`, `PRIMARY_TAX_CONTACT` |
| `POST`, `PATCH`, `DELETE /parties/:id/contact-methods[/:methodId]` | `business-directory::directory::write`       | `NOT_FOUND`, `INVALID_INPUT`, `INVALID_STATE`                   |
| `POST`, `PATCH`, `DELETE /parties/:id/addresses[/:addressId]`      | `business-directory::directory::write`       | `NOT_FOUND`, `INVALID_INPUT`                                    |
| `GET /{collection}/:id/tax-id`                                     | `business-directory::tax-ids::read`          | `NOT_FOUND`                                                     |
| `GET /labels`                                                      | `business-directory::directory::read`        | —                                                               |
| `POST /labels`, `PATCH /labels/:id`, `/archive`, `/restore`        | `business-directory::labels::write`          | `INVALID_INPUT`, `CONFLICT`                                     |
| `GET /tenant-contacts`                                             | `business-directory::directory::read`        | —                                                               |
| `PUT /tenant-contacts/:partyId/:designation`                       | `business-directory::tenant-contacts::write` | `NOT_FOUND`, `NOT_EMPLOYEE`                                     |
| `DELETE /tenant-contacts/:partyId/:designation`                    | `business-directory::tenant-contacts::write` | `NOT_FOUND`, `LAST_PRIMARY_CONTACT`                             |

- `{collection}` is `people`, `organizations`, or `organization-contacts`. A create request names the `kind`; an organization contact takes its kind from its organization.
- Creating a client without its own tax ID includes its buyers in `contacts`, one flagged `isPrimaryTaxContact`, so R007 holds when the request commits. `PATCH /organizations/:id` moves a client's tax source with `taxId` and `primaryTaxContactId`.
- Making an email, phone, or address primary demotes the party's previous primary of that type in the same transaction.
- `PUT /tenant-contacts/...` repeated for an active designation returns it unchanged.
- `DELETE` routes archive the row; they take no `revision`.
- Writes use optimistic concurrency on `revision`.
- `GET /{collection}?taxId=` searches by tax ID and requires `business-directory::tax-ids::read` (R013).
- A create or edit that includes a tax ID also requires `business-directory::tax-ids::write`; without it the request fails with `FORBIDDEN`.

## 11. Cross-Module Interactions

- I0006 gains the first administrator's name (R021) and creates the directory rows in its seed stage (R022).
- M0001 and M0002 change `member_type` values and require `member_id` (R023, R024).
- M0004 supplies country codes and the country lookup control for addresses.
- Portal Access will read `is_portal_user` and create logins from it.
- Administrative events follow M0001-12.

## 12. Security And Audit

- Tax ID protection is R010–R013; change and reveal events are R012 and R025.
- Future enhancement: key rotation. Storing a key version on each row would let a job re-encrypt rows and recompute hashes under new keys, so a leaked old key stops working.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                                                              | Requirements                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| AC01      | The cell migration creates the eight tables with RLS; reruns are no-ops.                                                                                                                                                     | M0005-R001–R004, R014, R015, R017, R018 |
| AC02      | A child row whose party has the wrong `kind` is rejected.                                                                                                                                                                    | M0005-R005                              |
| AC03      | A vendor without a tax ID, a client with both or neither of a tax ID and a primary tax contact, and a vendor contact with a tax ID are rejected.                                                                             | M0005-R006–R008                         |
| AC04      | A client has at most one primary tax contact, drawn from its own contacts; the flagged contact must have a tax ID and cannot be archived while flagged.                                                                      | M0005-R007, R009                        |
| AC05      | A second primary email, phone, or address for one party is rejected.                                                                                                                                                         | M0005-R014, R015                        |
| AC06      | A tenant can hold two primary and two billing contacts; a non-employee is rejected; removing the last primary is rejected.                                                                                                   | M0005-R018, R019                        |
| AC07      | Provisioning a tenant creates the administrator's employee, primary email, labels, and primary tenant contact, and links the membership's `member_id`; the Napsoft root membership keeps `member_type` and `member_id` null. | M0005-R021–R023                         |
| AC08      | `client` is no longer a valid `member_type`; `client_contact` is.                                                                                                                                                            | M0005-R024                              |
| AC09      | Each directory change writes an outbox row; delivery writes an event with the tax ID masked.                                                                                                                                 | M0005-R025                              |
| AC10      | A stored tax ID has no plain-text copy in the table, logs, outbox, or events; decrypting it returns the original; the API does not start without both keys.                                                                  | M0005-R010, R011                        |
| AC11      | Without `tax-ids::read` a response shows only the last four digits and tax ID search fails; with it the full value returns and an event is written; saving a tax ID without `tax-ids::write` fails.                          | M0005-R012, R013                        |
| AC12      | Searching by a tax ID entered with or without dashes finds the record; saving a duplicate succeeds and returns `duplicateTaxIds`.                                                                                            | M0005-R013                              |
| AC13      | The directory screens support list, search, view, create, edit, archive, and restore, hiding disallowed actions.                                                                                                             | M0005-R026                              |

## 14. Outstanding Questions

None.
