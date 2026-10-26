# M0005: Business Directory

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented (R001–R034, R036–R044, R046–R053); R035, R045 withdrawn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Type                 | Module                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Related architecture | [Module map](../../architecture/module-map.md), [Migrations](../../architecture/migrations.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Related PRDs         | [M0002-01: Cell Database Foundation](M0002-cell-tenancy/M0002-01-cell-database-foundation.md), [M0003: Access Control](M0003-access-control.md), [M0004: Reference Data](M0004-reference-data.md), [I0004: Admin-Cell Sync](../inter-module-workflows/I0004-admin-cell-sync.md), [I0006: Tenant Provisioning](../inter-module-workflows/I0006-tenant-provisioning.md), [I0011: Archived Records View](../inter-module-workflows/I0011-archived-records-view.md), [I0001: Application Entry and Shell](../inter-module-workflows/I0001-application-entry-and-shell.md), [M0006-01: General Settings](M0006-tenant-settings/M0006-01-general-settings.md) |
| Related decisions    | Roles stay in `access-control` and attach to logins; the directory stores people and organizations, not permissions. Phones and tax IDs are stored unformatted and formatted on display; phones entered without a country code are US; tenants define tax ID formats per country, and a used format can change only its name and separators (2026-10-24). The baseline migration is edited in place for these, so cells are recreated (2026-10-25)                                                                                                                                                                                                      |
| Last reviewed        | 2026-10-26                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## 2. Purpose

Later modules need to know who a tenant works with. `business-directory` stores
the tenant's employees, contacts, vendors, clients, and the people at each
vendor and client, with their emails, phones, and addresses. A vendor's or
client's contacts can be flagged as its primary and billing contacts.
Provisioning a tenant creates the first administrator as an employee.

## 3. Scope

### Included

- Employees, contacts, vendors, clients, vendor contacts, and client contacts.
- Emails, phones, and addresses for any directory record, with user-defined labels.
- Tax IDs on people, vendors, clients, and client contacts.
- Tenant-defined tax ID formats by country, and the Settings screen that manages them.
- Storing phones in one international form and formatting them for display.
- Primary and billing contact flags on vendor and client contacts.
- The `is_portal_user` flag on people, vendor contacts, and client contacts.
- Creating the first administrator's employee record during tenant provisioning.
- Directory screens, with standard grids, row actions, and bulk archive and
  restore.

### Excluded

- Creating, suspending, or linking logins when `is_portal_user` changes:
  [I0008: Portal Access](../inter-module-workflows/I0008-portal-access.md).
- Roles and role assignments: M0003.
- Legal entities and tax registrations of the tenant itself: Companies (roadmap 21).
- Tenant-defined phone formats. Every country's phone format comes from libphonenumber.
- Formatting phones and tax IDs as the user types, which belongs with the data-entry changes to the directory dialogs.

## 4. Actors And Permissions

| Required capability                                   | Allows                                               |
| ----------------------------------------------------- | ---------------------------------------------------- |
| `<TENANT>::business-directory::directory::read`       | List and view directory records and labels           |
| `<TENANT>::business-directory::directory::write`      | Create, edit, archive, and restore directory records |
| `<TENANT>::business-directory::labels::write`         | Create, rename, archive, and restore labels          |
| `<TENANT>::business-directory::tax-ids::read`         | Read full tax IDs and search by tax ID               |
| `<TENANT>::business-directory::tax-ids::write`        | Set, change, and clear tax IDs                       |
| `<TENANT>::business-directory::tax-id-formats::write` | Create, edit, archive, and restore tax ID formats    |

`tenant_admin` holds all of them through `<CODE>::*::*::*` (M0003-R007).
`business-directory` is a foundation module: every tenant can use it, with no
entitlement row (M0001-10), because provisioning creates its first rows
(R022).

## 5. Concepts And Terminology

| Term                 | Meaning                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Party                | Any directory record: a person, an organization, or an organization contact                                                                                    |
| Person               | An employee or a contact                                                                                                                                       |
| Contact              | A person who is not an employee, such as an inspector or a lender                                                                                              |
| Organization         | A vendor or a client                                                                                                                                           |
| Organization contact | A person at a vendor (vendor contact) or at a client (client contact)                                                                                          |
| Client               | The party the tenant sells to. In construction, the unit being sold; the buyers are its client contacts                                                        |
| Contact method       | One email or phone number of a party                                                                                                                           |
| Label                | A tenant-defined category for a contact method or address, such as spouse, emergency, or billing                                                               |
| Tax ID               | A taxpayer number in a tenant-defined format, such as a US Social Security Number (SSN) for a person or an Employer Identification Number (EIN) for a business |
| Tax ID format        | A tenant-defined pattern for one kind of tax ID in one country, such as US SSN `###-##-####`                                                                   |
| Mask                 | A format's pattern. `#` is a digit slot, `A` is a letter slot, and every other character is a separator                                                        |
| Slot                 | One position in a mask that holds a character of the tax ID                                                                                                    |
| Separator            | A mask character shown on display but not stored, such as `-` or the `GB` in `GB ### #### ##`                                                                  |
| Canonical tax ID     | The slot characters alone, uppercased, such as `123456789` for `123-45-6789`                                                                                   |
| E.164                | The International Telecommunication Union (ITU) phone format: `+`, country code, and number, digits only, such as `+12125551234`                               |
| libphonenumber       | Google's open-source library of each country's phone numbering and display rules                                                                               |

## 6. Functional Requirements

### Records

- M0005-R001: Every directory record must have one `app.parties` row with `kind` in `employee`, `contact`, `vendor`, `client`, `vendor_contact`, `client_contact`. `kind` never changes. A record's optional tax ID is stored on its party.
- M0005-R002: Employees and contacts are stored in `app.people`, each with a first name, last name, optional tax ID, and portal flag.
- M0005-R003: Vendors and clients are stored in `app.organizations`, each with a legal name, an optional "doing business as" name, and a tax ID or primary tax contact (R006, R007).
- M0005-R004: Vendor contacts and client contacts are also stored in `app.people`, each with a first name, last name, optional tax ID, portal flag, and the `organization_id` it belongs to. A vendor contact belongs to a vendor and a client contact to a client. Any number of an organization's contacts may be flagged as its primary contact or billing contact; only an organization contact can carry either flag.
- M0005-R005: A party's child row must match its `kind`. For example, a `people` row may point only at an `employee` or `contact` party.

### Tax IDs

- M0005-R006: A vendor must have a tax ID and no primary tax contact.
- M0005-R007: A client must have exactly one of a tax ID or a primary tax contact. A business client uses its own EIN. A home buyer client names one of its own client contacts as primary tax contact, whose tax ID is then the client's primary tax ID.
- M0005-R008: A vendor contact must not have a tax ID. A client contact may.
- M0005-R009: A client has at most one primary tax contact, flagged on the contact itself. The flagged contact must have a tax ID and cannot be archived while flagged.
- M0005-R010: A tax ID is never stored in plain text. It is stored encrypted with AES-256-GCM (Advanced Encryption Standard in Galois/Counter Mode) using a fresh random value (nonce) per write, as an HMAC-SHA-256 keyed hash of its digits, and as its last four digits. The plain value must not appear in logs, outbox rows, or events. _Superseded in part by R038 and R039 (canonical value in place of digits)._
- M0005-R011: The encryption key and the hash key come from deploy secrets `TAX_ID_ENCRYPTION_KEY_<ENV>` and `TAX_ID_HASH_KEY_<ENV>` and are never stored in a database. The API must refuse to start without them. Neither key rotates.
- M0005-R012: Responses show only `taxIdLast4`. Reading a full tax ID requires `business-directory::tax-ids::read` and writes an event recording who read which record. Setting, changing, or clearing a tax ID requires `business-directory::tax-ids::write`.
- M0005-R013: Searching by tax ID requires `business-directory::tax-ids::read`. The API hashes the entered digits and matches `tax_id_hash`. _Superseded in part by R039 (canonical value in place of digits) and R047 (a same-kind duplicate is refused instead of returned as `duplicateTaxIds`)._

### Emails, phones, and addresses

- M0005-R014: Emails and phones are stored in `app.contact_methods`, each with an optional label. A party has at most one primary email and one primary phone.
- M0005-R015: Addresses are stored in `app.addresses`, each with an M0004 country code and an optional label. A party has at most one primary address.
- M0005-R016: An employee must have a primary email. Creating an employee requires one, and removing or demoting an employee's only primary email fails with `INVALID_STATE`.
- M0005-R017: Labels are stored in `app.contact_labels`. Each applies to emails, phones, or addresses, and its name is unique within that group. The tenant seed creates `work`, `home`, `mobile`, `spouse`, `emergency`, `billing`, and `location`.

### Tenant contacts

- M0005-R018: Withdrawn. A tenant no longer designates its own employees as primary or billing contacts. Napsoft keeps a tenant's contacts on its client record in the Napsoft tenant (I0006-R001).
- M0005-R019: Withdrawn with R018.

### Portal flag

- M0005-R020: `is_portal_user` on a person or organization contact is stored and shown. Changing it creates, links, or suspends the login as defined in [I0008: Portal Access](../inter-module-workflows/I0008-portal-access.md).

### Provisioning

- M0005-R021: `tenant-provision` (I0006-R001) must also require the first administrator's `firstName` and `lastName`. It must generate the administrator's party ID and store it as the membership's `member_id` (I0006-R002).
- M0005-R022: The seed stage (I0006-R007) must, in the same cell transaction, create the employee party, the `people` row with `is_portal_user = true`, the login email as the primary email, and the default labels (R017). The readback check covers these rows.
- M0005-R023: An active, ready membership with a `member_type` must have a `member_id`. This replaces I0006's rule that `member_id` may be null. The Napsoft root membership keeps `member_type` and `member_id` null and has no employee record; it is an emergency login for first setup and recovery. Napsoft staff who need an employee record get their own login with an `employee` membership.
- M0005-R024: `member_type` values become `employee`, `contact`, `vendor_contact`, `client_contact` in `admin.portal_user_tenants`, `cell.tenant_members`, and the admin provisioning job kinds. `client` is removed, because the login belongs to the buyer, not the client.

### Events and screens

- M0005-R025: Every directory write must write a `cell.outbox` row in the same cell transaction. The sync worker (I0004) delivers it to admin, where it writes an administrative event with actor, tenant, record, and before and after values. Tax IDs appear in events only as their last four characters.
- M0005-R026: The web app must provide screens to list, search, view, create, edit, archive, and restore each record type; to manage a record's emails, phones, and addresses; and to manage labels. Actions the session cannot perform are hidden (I0005).

### Lists and bulk actions

- M0005-R027: `GET /people`, `/organizations`, and `/organization-contacts` must return cursor pages (`{ rows, nextCursor }`, `cursor` and `limit` 1–100, default 50), keeping their existing filters (`kind`, `q`, `taxId`, `organizationId`, `includeArchived`). _Superseded in part by I0011-R009 ([I0011](../inter-module-workflows/I0011-archived-records-view.md), `includeArchived`)._
- M0005-R028: Every directory list screen (employees, contacts, vendors, clients, and an organization's contacts) must be a standard grid (I0001-R015–R017). Selecting a record's name still opens its detail. Each row's action menu must offer **Edit**, and **Archive** for an active record or **Restore** for an archived one, hiding actions the session cannot perform. _Superseded in part by R049 (Edit opens the detail)._ Archive asks for confirmation with "Archived records are hidden from lists until restored." _Superseded in part by I0011-R007 ([I0011](../inter-module-workflows/I0011-archived-records-view.md), confirmation text)._
- M0005-R029: Selecting rows on the current page must show **Archive selected** and **Restore selected** in the contextual action header (I0001-R028), each after one confirmation naming the count. Archive selected applies only when every selected record is active, and Restore selected only when every one is archived. _Superseded in part by I0011-R005 ([I0011](../inter-module-workflows/I0011-archived-records-view.md))._
- M0005-R030: `POST /{collection}/archive` and `POST /{collection}/restore` with `{ items: [{ id, revision }, …] }` (1–100 items) must apply the single-record archive or restore, with all its rules and side effects (R009, R025, and I0008-R002, R005, R006), to every item in one cell transaction. It is all-or-nothing: if any item fails, nothing changes and the response is `409 BULK_FAILED` with `details: [{ id, code }]` naming each failed item and its error code. The screen must list each failed record by name with the reason, and keep the selection so the user can deselect and retry.

### Labels screen

- M0005-R031: The labels screen must be a standard grid (I0001-R025–R034) with For and Name columns. `GET /labels` returns the full list, which the grid pages in the browser. The header holds a name search, a filter popover with For and Include archived, and **Add label** last. Each row's ⋮ menu offers **Rename** and then **Archive** or **Restore**. Add label and Rename open a dialog. Selected rows offer **Archive selected** and **Restore selected** as in R029. _Superseded in part by I0011-R004 and R005 ([I0011](../inter-module-workflows/I0011-archived-records-view.md))._
- M0005-R032: `POST /labels/archive` and `POST /labels/restore` with `{ items: [{ id, revision }, …] }` (1–100 items) must apply the single-label archive or restore to every item in one cell transaction, all-or-nothing, with the same `409 BULK_FAILED` response and screen behavior as R030.

### Phone formatting

- M0005-R033: A phone must be stored in E.164 form, with an extension stored as a `;ext=` suffix (`+12125551234;ext=12`). Input without a leading `+` is read as a US number. Input that libphonenumber does not accept as a valid number for its country fails with `INVALID_INPUT`. _Superseded in part by R046 ([M0006-01](M0006-tenant-settings/M0006-01-general-settings.md), the tenant's default country in place of the US)._
- M0005-R034: A phone must be displayed in its country's national format when its country is the US (`(212) 555-1234`) and in international format otherwise (`+44 20 7946 0958`), with an extension shown as ` ext. 12`. _Superseded in part by R046 ([M0006-01](M0006-tenant-settings/M0006-01-general-settings.md), the tenant's default country in place of the US)._
- M0005-R035: Withdrawn. The baseline migration is edited in place and cell databases are recreated, so no existing phone needs converting.

### Tax ID formats

- M0005-R036: Tax ID formats are stored in `app.tax_id_formats`, each with an M0004 country, a name unique within that country, and a mask with 4 to 32 slots.
- M0005-R037: The tenant seed creates three US formats: `SSN` `###-##-####`, `EIN` `##-#######`, and `ITIN` `###-##-####` (Individual Taxpayer Identification Number).
- M0005-R038: Every tax ID must name its format. After spaces and hyphens are removed and letters are uppercased, the entered value must equal either the mask filled in, its other separators included, or the slot characters alone. Each slot must hold its type of character. The canonical tax ID is what is encrypted. A new or changed tax ID must name an active format.
- M0005-R039: `tax_id_hash` and `tax_id_last4` must be computed from the canonical tax ID, so the same number matches under R013 whichever format it was saved with.
- M0005-R040: A masked tax ID must be displayed in its format's layout, with every slot except the last four shown as `•` (`•••-••-1234` for an SSN, `••-•••4567` for an EIN). A revealed tax ID must be displayed in its format's layout.
- M0005-R041: Once any record, active or archived, uses a format, an edit may change only its name and separators; changing its slot count or slot types fails with `INVALID_STATE`. A format can be archived and restored. An archived format keeps formatting the tax IDs that use it.
- M0005-R042: Settings must offer a Tax ID Formats screen. It follows the labels screen (R031, R032): a standard grid with Country, Name, and Mask columns, Active and Archived tabs (I0011), **Add format** and **Edit** in dialogs, and single and bulk archive and restore.
- M0005-R043: The tax ID field in the directory dialogs must offer a choice of the tenant's active formats. It defaults to US EIN for a vendor or client and US SSN for a person, when that format is active.
- M0005-R044: The API's validation and the web app's display must use one shared definition of R033, R034, R038, and R040, so both produce the same result.
- M0005-R046: A phone entered without a leading `+` must be read as a number of the tenant's effective `defaultCountry` (M0006-01-R011), and a phone of that country must be displayed in national format; any other phone is displayed in international format. Both the API and the web app must use that country.
- M0005-R045: Withdrawn with R035. Recreated cells have no existing tax IDs, and every tenant gets the R037 formats from its seed.

### Unique tax IDs

- M0005-R047: Within a tenant, at most one party of each kind among `employee`, `contact`, `vendor`, and `client` may hold a given tax ID, matched by `tax_id_hash` and counting archived records. Client contacts are exempt, because one buyer can be a contact on several clients. Records of different kinds may share a number. A unique index on `app.parties` enforces it, and the save checks it first in the same transaction.
- M0005-R048: Saving a tax ID that another record of the same kind holds must fail with `409 DUPLICATE_TAX_ID`, with details `{ id, archived }` naming that record and nothing about the number. The directory dialog must say "Another {kind} already has this tax ID." with a link that opens that record, or, when it is archived, a link that opens it in the Archived view, where it can be restored.

### Single edit path

- M0005-R049: A record's detail dialog must be the only place it is edited (I0001-R036). Pencils beside the name (with the DBA name for an organization), the tax ID, and portal access open dialogs that change only that part; emails, phones, and addresses keep their own pencils. The detail has no footer Edit. A row's ⋮ **Edit**, in a directory list or in an organization's contacts grid, opens the record's detail. The contacts grid itself stays as it is.
- M0005-R050: Creating a record must ask only for what it cannot exist without (I0001-R037): an employee's first name, last name, and primary email; a contact's first and last name; a vendor's legal name and tax ID with its format (R006); a client's legal name and either its own tax ID or one primary buyer with a tax ID (R007); and an organization contact's first and last name. The DBA name, more buyers, portal access, roles, and a temporary password are set from the detail afterwards. Saving opens the new record's detail; **New contact** in an organization's detail opens the new contact.
- M0005-R051: An organization contact's detail must show **Primary contact** and **Billing contact** as switches beside the values, which save on change. A client contact shows whether it is the primary tax contact, with an action to make it so; the contacts grid's row action calls the same thing.
- M0005-R052: The tax ID dialog must offer the active formats (R043), the value, and **Clear** when the record may have none (not a vendor, and not a client's primary tax contact). A duplicate shows R048's message and link. The current value is shown masked beside the pencil, not inside the dialog.
- M0005-R053: The directory grid's column for the primary and billing flags must be named **Contact type**, so it does not read as portal roles. The DBA name has one label, "DBA name", in the detail and its dialog.

## 7. Business Rules And Invariants

- The database enforces the keys, checks, and unique indexes in section 9.
- The model layer enforces rules that span tables: R005 and R009's tax ID rule.
- The database enforces that a tax ID's format, ciphertext, hash, and last four are all set or all null.
- The module domain enforces R033's phone rule, R038's match against the mask, the active-format rule, and R041's slot lock.

## 8. Lifecycle And State Transitions

| State    | Action                                 | Result                                           |
| -------- | -------------------------------------- | ------------------------------------------------ |
| —        | Create                                 | Active record                                    |
| Active   | Edit                                   | Changed; event written                           |
| Active   | Archive                                | Archived; its contact methods and addresses stay |
| Active   | Archive a client's primary tax contact | Reject `PRIMARY_TAX_CONTACT`                     |
| Archived | Restore                                | Active                                           |

Tax ID formats:

| State    | Action                                  | Result                                         |
| -------- | --------------------------------------- | ---------------------------------------------- |
| —        | Create                                  | Active format                                  |
| Active   | Rename or change separators             | Changed; tax IDs using it display the new form |
| Active   | Change slots of a format no record uses | Changed                                        |
| Active   | Change slots of a format a record uses  | Reject `INVALID_STATE`                         |
| Active   | Archive                                 | Archived; not offered for new tax IDs          |
| Archived | Restore                                 | Active                                         |

## 9. Data Requirements

All tables are in each tenant's cell in the `app` schema and follow the rules
for tenant business tables (M0002-01-R006). Every table also has the standard
audit fields, soft delete (`deactivated_at`), and `revision`. Row-level
security (RLS) limits each query to the session's tenant through `tenant_id`.

| Table             | Schema object          | Behavior defined by                           |
| ----------------- | ---------------------- | --------------------------------------------- |
| `parties`         | `partiesSchema`        | R001, R005, R008, R010–R013, R038, R039, R047 |
| `people`          | `peopleSchema`         | R002, R004, R007, R009                        |
| `organizations`   | `organizationsSchema`  | R003, R006, R007                              |
| `contact_methods` | `contactMethodsSchema` | R014, R016, R033, R034                        |
| `addresses`       | `addressesSchema`      | R015                                          |
| `contact_labels`  | `contactLabelsSchema`  | R017                                          |
| `tax_id_formats`  | `taxIdFormatsSchema`   | R036–R041                                     |

### `app.parties`

One row per directory record. It has audit fields but no soft delete or
`revision`; a record is archived and versioned through its child row.

| Column             | Type       | Rules                                                                                                                                             |
| ------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | `uuid`     | Primary key, default `gen_random_uuid()`; immutable                                                                                               |
| `tenant_id`        | `uuid`     | Not null; immutable; RLS column                                                                                                                   |
| `kind`             | `text`     | Not null; `employee`, `contact`, `vendor`, `client`, `vendor_contact`, or `client_contact`; immutable                                             |
| `tax_id_encrypted` | `text`     | Base64 of nonce, authentication tag, and ciphertext (R010); null when no tax ID                                                                   |
| `tax_id_format_id` | `uuid`     | References `tax_id_formats.id` (R038); null with `tax_id_encrypted`                                                                               |
| `tax_id_hash`      | `char(64)` | Hex HMAC-SHA-256 of the canonical tax ID (R039); null with `tax_id_encrypted`; indexed; unique per tenant and kind except `client_contact` (R047) |
| `tax_id_last4`     | `char(4)`  | Last four characters of the canonical tax ID, digits or uppercase letters; null with `tax_id_encrypted`                                           |

A `vendor_contact` party has no tax ID (R008).

### `app.organizations`

One row per vendor or client.

| Column       | Type   | Rules                                                                      |
| ------------ | ------ | -------------------------------------------------------------------------- |
| `party_id`   | `uuid` | Primary key; references `parties.id`; immutable                            |
| `tenant_id`  | `uuid` | Not null; immutable; RLS column                                            |
| `legal_name` | `text` | Not null; for a home buyer client, the unit, such as `Lot 12, Maple Ridge` |
| `dba_name`   | `text` | Nullable                                                                   |

### `app.people`

One row per employee, contact, vendor contact, or client contact.

| Column                   | Type      | Rules                                                                                                                                            |
| ------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `party_id`               | `uuid`    | Primary key; references `parties.id`; immutable                                                                                                  |
| `tenant_id`              | `uuid`    | Not null; immutable; RLS column                                                                                                                  |
| `organization_id`        | `uuid`    | Nullable; references `organizations.party_id`; set for vendor and client contacts only; immutable                                                |
| `first_name`             | `text`    | Not null                                                                                                                                         |
| `last_name`              | `text`    | Not null                                                                                                                                         |
| `is_portal_user`         | `boolean` | Not null, default `false`                                                                                                                        |
| `is_primary_contact`     | `boolean` | Not null, default `false`; that organization's primary contact; requires `organization_id` (R004)                                                |
| `is_billing_contact`     | `boolean` | Not null, default `false`; that organization's billing contact; requires `organization_id` (R004)                                                |
| `is_primary_tax_contact` | `boolean` | Not null, default `false`; requires `organization_id`; client contacts only; unique per `organization_id` among active flagged rows (R007, R009) |

### `app.contact_methods`

One row per email or phone.

| Column       | Type      | Rules                                                                              |
| ------------ | --------- | ---------------------------------------------------------------------------------- |
| `id`         | `uuid`    | Primary key, default `gen_random_uuid()`; immutable                                |
| `tenant_id`  | `uuid`    | Not null; immutable; RLS column                                                    |
| `party_id`   | `uuid`    | Not null; references `parties.id`; immutable                                       |
| `type`       | `text`    | Not null; `email` or `phone`; immutable                                            |
| `value`      | `text`    | Not null; email lowercased and trimmed; phone in E.164 form (R033)                 |
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

### `app.tax_id_formats`

One row per tax ID format.

| Column      | Type      | Rules                                                               |
| ----------- | --------- | ------------------------------------------------------------------- |
| `id`        | `uuid`    | Primary key, default `gen_random_uuid()`; immutable                 |
| `tenant_id` | `uuid`    | Not null; immutable; RLS column                                     |
| `country`   | `char(2)` | Not null; M0004 country code; immutable                             |
| `name`      | `text`    | Not null; unique per `(tenant_id, country)`, archived rows included |
| `mask`      | `text`    | Not null; 4 to 32 slots (R036); slots locked once used (R041)       |

## 10. API Requirements

Base: `/api/business-directory/v1`. Route capabilities omit the tenant part, which I0005 adds.

| Method and route                                                            | Route capability                            | Errors                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| `GET /people`, `/organizations`, `/organization-contacts`                   | `business-directory::directory::read`       | —                                                              |
| `GET /{collection}/:id`                                                     | `business-directory::directory::read`       | `NOT_FOUND`                                                    |
| `POST /{collection}`                                                        | `business-directory::directory::write`      | `INVALID_INPUT`, `DUPLICATE_TAX_ID`                            |
| `PATCH /{collection}/:id`                                                   | `business-directory::directory::write`      | `INVALID_INPUT`, `STALE_REVISION`, `DUPLICATE_TAX_ID`          |
| `POST /{collection}/:id/archive`, `/restore`                                | `business-directory::directory::write`      | `STALE_REVISION`, `PRIMARY_TAX_CONTACT`                        |
| `POST`, `PATCH`, `DELETE /parties/:id/contact-methods[/:methodId]`          | `business-directory::directory::write`      | `NOT_FOUND`, `INVALID_INPUT`, `INVALID_STATE`                  |
| `POST`, `PATCH`, `DELETE /parties/:id/addresses[/:addressId]`               | `business-directory::directory::write`      | `NOT_FOUND`, `INVALID_INPUT`                                   |
| `POST /{collection}/archive`, `/restore` (bulk)                             | `business-directory::directory::write`      | `INVALID_INPUT`, `BULK_FAILED`                                 |
| `GET /{collection}/:id/tax-id`                                              | `business-directory::tax-ids::read`         | `NOT_FOUND`                                                    |
| `GET /labels`                                                               | `business-directory::directory::read`       | —                                                              |
| `POST /labels`, `PATCH /labels/:id`, `/archive`, `/restore`                 | `business-directory::labels::write`         | `INVALID_INPUT`, `CONFLICT`                                    |
| `POST /labels/archive`, `/restore` (bulk)                                   | `business-directory::labels::write`         | `INVALID_INPUT`, `BULK_FAILED`                                 |
| `GET /tax-id-formats`                                                       | `business-directory::directory::read`       | —                                                              |
| `POST /tax-id-formats`, `PATCH /tax-id-formats/:id`, `/archive`, `/restore` | `business-directory::tax-id-formats::write` | `INVALID_INPUT`, `CONFLICT`, `INVALID_STATE`, `STALE_REVISION` |
| `POST /tax-id-formats/archive`, `/restore` (bulk)                           | `business-directory::tax-id-formats::write` | `INVALID_INPUT`, `BULK_FAILED`                                 |

- `{collection}` is `people`, `organizations`, or `organization-contacts`. A create request names the `kind`; an organization contact takes its kind from its organization.
- Creating a client without its own tax ID includes its buyers in `contacts`, one flagged `isPrimaryTaxContact`, so R007 holds when the request commits. `PATCH /organizations/:id` moves a client's tax source with `taxId` and `primaryTaxContactId`.
- Making an email, phone, or address primary demotes the party's previous primary of that type in the same transaction.
- `DELETE` routes archive the row; they take no `revision`.
- Writes use optimistic concurrency on `revision`.
- List routes return cursor pages (R027). A bulk request's `details` uses the single-record codes: `NOT_FOUND`, `STALE_REVISION`, `PRIMARY_TAX_CONTACT`, `ADMIN_ASSIGNED`, and `INVALID_STATE`.
- `GET /{collection}?taxId=` searches by tax ID and requires `business-directory::tax-ids::read` (R013).
- A create or edit that includes a tax ID also requires `business-directory::tax-ids::write`; without it the request fails with `FORBIDDEN`.
- A request that sets a tax ID also sends `taxIdFormatId` (R038). Record responses include `taxIdFormatId` next to `taxIdLast4`, and phones in their stored form; the web app formats both (R034, R040).
- `GET /tax-id-formats` returns the full list, archived formats included, so the web app can display tax IDs that use an archived format.

## 11. Cross-Module Interactions

- I0006 gains the first administrator's name (R021) and creates the directory rows in its seed stage (R022).
- M0001 and M0002 change `member_type` values and require `member_id` (R023, R024).
- M0004 supplies country codes and the country lookup control for addresses and tax ID formats.
- I0008 reads `is_portal_user` and creates, links, or suspends logins from it.
- Administrative events follow M0001-12.

## 12. Security And Audit

- Tax ID protection is R010–R013; change and reveal events are R012 and R025.
- Tax ID format changes are directory writes and write events under R025. A format holds no tax ID.
- Future enhancement: key rotation. Storing a key version on each row would let a job re-encrypt rows and recompute hashes under new keys, so a leaked old key stops working.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                                                 | Requirements                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| AC01      | The cell migration creates the six tables with RLS; reruns are no-ops.                                                                                                                                          | M0005-R001–R004, R014, R015, R017 |
| AC02      | A child row whose party has the wrong `kind` is rejected.                                                                                                                                                       | M0005-R005                        |
| AC03      | A vendor without a tax ID, a client with both or neither of a tax ID and a primary tax contact, and a vendor contact with a tax ID are rejected.                                                                | M0005-R006–R008                   |
| AC04      | A client has at most one primary tax contact, drawn from its own contacts; the flagged contact must have a tax ID and cannot be archived while flagged.                                                         | M0005-R007, R009                  |
| AC05      | A second primary email, phone, or address for one party is rejected.                                                                                                                                            | M0005-R014, R015                  |
| AC06      | An organization can have several primary and billing contacts; the database rejects either flag on a person with no organization.                                                                               | M0005-R004                        |
| AC07      | Provisioning a tenant creates the administrator's employee, primary email, and labels, and links the membership's `member_id`; the Napsoft root membership keeps `member_type` and `member_id` null.            | M0005-R021–R023                   |
| AC08      | `client` is no longer a valid `member_type`; `client_contact` is.                                                                                                                                               | M0005-R024                        |
| AC09      | Each directory change writes an outbox row; delivery writes an event with the tax ID masked.                                                                                                                    | M0005-R025                        |
| AC10      | A stored tax ID has no plain-text copy in the table, logs, outbox, or events; decrypting it returns the original; the API does not start without both keys.                                                     | M0005-R010, R011                  |
| AC11      | Without `tax-ids::read` a response shows only the last four digits and tax ID search fails; with it the full value returns and an event is written; saving a tax ID without `tax-ids::write` fails.             | M0005-R012, R013                  |
| AC12      | Searching by a tax ID entered with or without dashes finds the record; saving a second employee with the same tax ID fails with `DUPLICATE_TAX_ID` naming the first.                                            | M0005-R013, R047, R048            |
| AC13      | The directory screens support list, search, view, create, edit, archive, and restore, hiding disallowed actions.                                                                                                | M0005-R026                        |
| AC14      | Each directory list returns cursor pages with its filters intact, and the screens page through them in a standard grid.                                                                                         | M0005-R027, R028                  |
| AC15      | A row's menu offers Edit and Archive on active records and Restore on archived ones, and hides them without `directory::write`.                                                                                 | M0005-R028                        |
| AC16      | Archive selected on a page of active records archives them all, turning off portal access where it was on; Restore selected restores them.                                                                      | M0005-R029, R030                  |
| AC17      | A bulk archive including a `tenant_admin`, the caller, a flagged primary tax contact, or a stale revision changes nothing and lists each failed record with its reason.                                         | M0005-R030                        |
| AC18      | The labels screen follows I0001's list-screen rules; Add label and Rename use dialogs; a bulk archive of labels with one stale revision changes nothing and lists the failed label.                             | M0005-R031, M0005-R032            |
| AC19      | `212-555-1234`, `(212) 555-1234`, and `+1 212 555 1234` all store `+12125551234`; `212 555 1234 x12` stores `+12125551234;ext=12`; `555-1234` fails with `INVALID_INPUT`.                                       | M0005-R033                        |
| AC20      | `+12125551234` displays as `(212) 555-1234` and `+442079460958` as `+44 20 7946 0958`.                                                                                                                          | M0005-R034                        |
| AC21      | Withdrawn with R035.                                                                                                                                                                                            | M0005-R035                        |
| AC22      | A new tenant has the three US formats, and a tax ID saved under SSN shows `•••-••-1234` and under EIN `••-•••4567`.                                                                                             | M0005-R036, R037, R040            |
| AC23      | Under SSN, `123-45-6789`, `123 45 6789`, and `123456789` all save; `12-3456789A` fails; under `GB ### #### ##`, `GB 123 4567 89` and `123456789` both save as `123456789`; an archived format cannot be chosen. | M0005-R038                        |
| AC24      | The same digits saved under SSN on one employee and EIN on another produce the same hash, so the second save fails with `DUPLICATE_TAX_ID`.                                                                     | M0005-R039, R047                  |
| AC25      | Renaming a used format or changing its separators succeeds and changes how its tax IDs display; changing its slots fails with `INVALID_STATE`; an unused format's slots can change.                             | M0005-R040, R041                  |
| AC26      | The Tax ID Formats screen follows R042 and is hidden without `directory::read`; its write actions are hidden without `tax-id-formats::write`.                                                                   | M0005-R042                        |
| AC27      | The tax ID field offers only active formats and defaults to EIN for a vendor or client and SSN for a person.                                                                                                    | M0005-R043                        |
| AC28      | The API and the web app return the same result for every phone and tax ID in AC19, AC20, AC23, and AC25.                                                                                                        | M0005-R044                        |
| AC29      | With `defaultCountry` `GB`, `020 7946 0958` stores `+442079460958` and displays as `020 7946 0958`, and `+12125551234` displays as `+1 212 555 1234`.                                                           | M0005-R046                        |
| AC30      | When the holder is archived, the error carries `archived: true`, the dialog links to it in the Archived view, and restoring it brings it back with its tax ID.                                                  | M0005-R047, R048                  |
| AC31      | Two client contacts, and an employee and a contact, may hold the same tax ID.                                                                                                                                   | M0005-R047                        |
| AC32      | A record's detail edits the name, tax ID, and portal access through pencils, with no footer Edit; row Edit, in a list or an organization's contacts grid, opens the detail.                                     | M0005-R049                        |
| AC33      | Each create dialog asks only for R050's fields and opens the new record; New contact opens the new contact.                                                                                                     | M0005-R050                        |
| AC34      | An organization contact's detail shows and toggles Primary contact and Billing contact; a client contact can be made the primary tax contact from its detail.                                                   | M0005-R051                        |
| AC35      | The tax ID dialog saves a new value, clears it where allowed, and shows the duplicate message and link; the grid column reads Contact type and the DBA label is "DBA name".                                     | M0005-R052, R053                  |

## 14. Outstanding Questions

None.
