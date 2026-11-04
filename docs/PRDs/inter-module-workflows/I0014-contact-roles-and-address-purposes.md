# I0014: Contact Roles and Address Purposes

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                                                                                                                                                                                                                                                      |
| Type                 | Inter-module workflow                                                                                                                                                                                                                                                                                                                                            |
| Related architecture | [Admin and cells](../../architecture/admin-cells.md), [Module map](../../architecture/module-map.md)                                                                                                                                                                                                                                                             |
| Related PRDs         | [M0005: Business Directory](../modules/M0005-business-directory.md), [I0013: Tenant Company Profile](I0013-tenant-company-profile.md), [I0006: Tenant Provisioning](I0006-tenant-provisioning.md), [I0004: Admin-Cell Sync](I0004-admin-cell-sync.md), [I0008: Portal Access](I0008-portal-access.md), [M0001: Admin Tenancy](../modules/M0001-admin-tenancy.md) |
| Related decisions    | Contact significance is a role, not a flag; a role has any number of holders. Roles the system acts on are fixed; tenants add their own as tags. `copy_all` is a copy (cc), never the main recipient, and is refused on a holder limited to one address. Delivery addresses come from the project's job site, not the directory (2026-11-03).                    |
| Last reviewed        | 2026-11-03                                                                                                                                                                                                                                                                                                                                                       |

## 2. Purpose

Future invoices, bills, payments, and notices need to know who to contact and
where to send things for each organization. Today a person carries a primary
flag and a billing flag, a customer tenant may have only one billing contact,
and an address's meaning is a label the tenant can rename. This workflow
replaces the flags with contact roles, gives organization addresses fixed
purposes, records how a bill-to address receives invoices, and names the
employee who owns each organization. It stores the setup data only; invoices
and payments that use it come later.

## 3. Scope

### Included

- Fixed contact roles `primary`, `billing`, and `notifications`, and
  tenant-defined role tags, on vendor contacts, client contacts, and a
  customer tenant's employees.
- An organization email holding the `billing` role, for team mailboxes.
- Limiting a `billing` role to one bill-to address, and the `copy_all` option.
- Address purposes `location`, `bill_to`, and `remit_to` on organization
  addresses, a default per purpose, and a delivery method on each bill-to
  address.
- The rules that resolve who receives an organization's invoices or payment
  questions, and where they go.
- An account owner employee on each vendor and client.
- Requiring a location for Napsoft clients, collected at provisioning.
- Replacing the flags in Napsoft's copy of tenant contacts.

### Excluded

- Invoices, bills, payments, sending, and the send log: accounts receivable
  and accounts payable (module map).
- Copying addresses onto documents, per-invoice recipient changes, and
  recipients per document type: built with those modules.
- Limiting a tenant's billing role to one of its companies: Companies
  (roadmap 27).
- Delivery addresses: the project's job site (roadmap 28).
- A payer separate from the bill-to organization, and a role for overdue
  reminders.
- `is_primary_tax_contact`, which stays as M0005-R007 and R009 define it.

## 4. Actors And Permissions

| Context                                                | Actor            | Required permission                                    | Required state                  | Result                                      |
| ------------------------------------------------------ | ---------------- | ------------------------------------------------------ | ------------------------------- | ------------------------------------------- |
| Set roles on a vendor or client contact                | Tenant user      | `<TENANT>::business-directory::directory::write`       | Contact active; R008–R010 hold  | Roles saved (R011)                          |
| Set the `billing` role on an organization email        | Tenant user      | `<TENANT>::business-directory::directory::write`       | Email active; R009, R010 hold   | Role saved (R012)                           |
| Set roles on a customer tenant's employee              | Tenant user      | `<TENANT>::business-directory::company-profile::write` | Employee active; R005–R010 hold | Roles saved; copy queued (R026)             |
| Set an address's purposes or delivery method           | Tenant user      | `<TENANT>::business-directory::directory::write`       | Address active; R017–R020 hold  | Purposes saved (R015)                       |
| Set an organization's account owner                    | Tenant user      | `<TENANT>::business-directory::directory::write`       | Owner is an active employee     | Owner saved (R022)                          |
| Read an organization's resolved recipients             | Tenant user      | `<TENANT>::business-directory::directory::read`        | Organization exists             | Address and recipients (R021)               |
| Create, rename, archive, or restore a role tag         | Tenant user      | `<TENANT>::business-directory::labels::write`          | —                               | Tag saved (R004)                            |
| Provision a tenant                                     | Napsoft operator | `NAP::admin-tenancy::control::write`                   | As I0013                        | Napsoft client created with location (R024) |
| View a tenant's contacts                               | Napsoft operator | `NAP::admin-tenancy::control::read`                    | Client has a tenant             | Read-only copy with roles (R027)            |
| Set a role on a Napsoft employee or standalone contact | Any              | —                                                      | —                               | `409 INVALID_STATE` (R005)                  |

## 5. Concepts And Terminology

| Term            | Meaning                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Role            | What a holder does for its organization or tenant. A system role is fixed and drives behavior; a role tag is tenant-defined text |
| Holder          | The person, or the organization email, that holds a role                                                                         |
| Primary         | The main relationship: signs and negotiates for a Napsoft client, manages the account for a vendor, buys for a client            |
| Billing         | Receives invoices and payment questions                                                                                          |
| Notifications   | A customer tenant's employee who receives Napsoft's maintenance and product notices                                              |
| Scope           | The one bill-to address a `billing` role is limited to; no scope means every address of the organization                         |
| `copy_all`      | A `billing` holder with no scope that receives a copy (cc) of every invoice for the organization                                 |
| Address purpose | What an organization address is for: `location`, `bill_to`, or `remit_to`                                                        |
| Location        | Where the organization operates, usually its head office                                                                         |
| Bill-to         | Where the organization's invoices go                                                                                             |
| Remit-to        | Where the tenant sends a vendor's payments                                                                                       |
| Delivery method | How a bill-to address receives invoices: `email`, `mail`, or `portal`                                                            |
| Account owner   | The tenant's employee responsible for a vendor or client: the sales rep for a client, the account manager for a Napsoft client   |
| Napsoft client  | As I0013: a client in the Napsoft tenant that belongs to one customer tenant                                                     |

## 6. Functional Requirements

### Roles

- I0014-R001: The system roles must be `primary`, `billing`, and
  `notifications`. Tenants cannot create, rename, or archive them.
- I0014-R002: A role may have any number of holders, and a holder may hold
  several roles. Each holder–role pair, with its scope, is held at most once.
- I0014-R003: Vendor contacts and client contacts may hold `primary` and
  `billing` for their organization. A customer tenant's employees may hold
  `primary`, `billing`, and `notifications` for the tenant.
- I0014-R004: Role tags must be labels with the new label group `role`
  (M0005-R017). Any person that may hold a system role may hold any number
  of active tags. The tenant seed creates no tags. Tags have no behavior.
- I0014-R005: Setting any role or tag on a standalone contact or on an
  employee of the Napsoft tenant must fail with `409 INVALID_STATE`. Setting
  `notifications` on a vendor or client contact must fail the same way.

### Customer tenant minimums

- I0014-R006: A customer tenant must always have at least one `primary`, one
  `billing`, and one `notifications` holder among its active employees.
  Vendors and clients have no minimum.
- I0014-R007: A change that would leave a customer tenant without a holder
  of a role must fail and change nothing: removing the role or archiving its
  last holder returns `409 LAST_PRIMARY_CONTACT`, `409 LAST_BILLING_CONTACT`,
  or `409 LAST_NOTIFICATIONS_CONTACT`. Bulk archive reports these codes per
  item (M0005-R030).

### Holder requirements

- I0014-R008: A customer tenant's `primary` holder must have a primary email
  and a primary phone. Its `billing` and `notifications` holders must have a
  primary email.
- I0014-R009: An organization's `billing` holder must meet the delivery
  method of every bill-to address it serves: its scoped address, or, with no
  scope, every bill-to address of the organization.
  - `email`: an organization email, or a person with a primary email.
  - `mail`: nothing.
  - `portal`: a person with portal access (M0005-R020).
- I0014-R010: A change that breaks R008 or R009 must fail with
  `409 CONTACT_DETAILS_REQUIRED` and change nothing. This covers setting a
  role, setting a scope, changing a delivery method, adding a purpose, and
  removing a holder's primary email, primary phone, or portal access.

### Holders and scope

- I0014-R011: A person's roles and tags must be replaced as one set in one
  cell transaction.
- I0014-R012: An email on a vendor or client may hold `billing` only. It
  follows the same scope and `copy_all` rules as a person.
- I0014-R013: A `billing` role on an organization contact or organization
  email may name one bill-to address of the same organization as its scope.
  Naming any other address fails with `409 INVALID_STATE`. A customer
  tenant's employees have no scope.
- I0014-R014: `copy_all` may be set only on a `billing` role with no scope,
  on an organization contact or organization email. Setting it with a scope
  fails with `400 INVALID_INPUT`.

### Address purposes

- I0014-R015: A vendor or client address may have any of the purposes
  `location`, `bill_to`, and `remit_to`. `remit_to` applies to vendors only;
  setting it on a client address fails with `400 INVALID_INPUT`. Addresses of
  people have no purposes and keep `is_primary` (M0005-R015).
- I0014-R016: An organization has at most one active default address per
  purpose. Making an address the default for a purpose clears the previous
  default in the same transaction. The first address given a purpose
  becomes its default.
- I0014-R017: A bill-to address must have a delivery method of `email`,
  `mail`, or `portal`. A new bill-to address defaults to `email`.
- I0014-R018: Removing the `bill_to` purpose from, or archiving, an address
  that scopes an active holder's `billing` role must fail with
  `409 ADDRESS_IN_USE`. An archived holder's role scoped to it ends instead.
- I0014-R019: Archiving the default address of a purpose that other active
  addresses share must make the oldest of them the default.
- I0014-R020: A Napsoft client must have a default `location` address.
  Archiving it, or removing its `location` purpose, fails with
  `409 LAST_LOCATION` unless another location address takes its place first.

### Resolution

- I0014-R021: `GET /organizations/:id/recipients` with `purpose=bill_to` and
  an optional `addressId`, or `purpose=remit_to`, must return the address and
  the recipients by these rules:
  - Bill-to address: the named bill-to address, else the default bill-to,
    else the default location, else the primary address.
  - To: the `billing` holders scoped to that address; if none, the
    `billing` holders with no scope and no `copy_all`; if none, the
    `primary` holders.
  - Copy: the `copy_all` holders. A `copy_all` holder is never in To.
  - Delivery method: the address's when it is a bill-to address, otherwise
    `email`.
  - Remit-to: the default remit-to, else the default location, else the
    primary address. To holds the `billing` holders, else the `primary`
    holders. There is no copy.
  - Each recipient is `{ kind: 'person' | 'email', id, name, email }`. A
    person with no primary email is returned with `email: null`.

### Account owner

- I0014-R022: A vendor or client may name one active employee of the same
  tenant as its account owner. Naming anyone else fails with
  `409 INVALID_STATE`. Archiving that employee keeps the link, and the
  organization shows the owner as archived.
- I0014-R023: The account owner reads as **Sales rep** on a client, as
  **Account manager** on a Napsoft client, and as **Account owner** on a
  vendor. The picker offers active employees only.

### Napsoft clients

- I0014-R024: `tenant-provision` (I0013-R001) must also take
  `"address": { "line1", "line2", "city", "region", "postalCode", "country" }`,
  validated as M0005 validates addresses. The client stage (I0013-R003) must
  store it on the Napsoft client as its default `location` and default
  `bill_to` with delivery method `email`.
- I0014-R025: Napsoft keeps a Napsoft client's addresses through the
  organization detail, as for any client. The tenant does not edit them.

### Napsoft's copy of tenant contacts

- I0014-R026: The contact copy of I0013-R015 must carry the employee's
  system roles in place of the two flags and the billing phone. It is
  written when the employee's roles, first or last name, primary email,
  primary phone, or archived state change. An employee with no system role
  is removed from the copy.
- I0014-R027: Napsoft's client record must list the copied contacts with a
  **Roles** column in place of **Contact type** and no billing phone
  (I0013-R017).

### Screens

- I0014-R028: A person's detail must show a **Roles** section listing its
  system roles, with each `billing` role's scope or "All addresses" and
  "Copy" when `copy_all` is set, and its tags. A pencil opens one dialog with
  a switch per allowed system role, a scope choice and **Copy on all
  invoices** switch under `billing` for an organization contact, and a tag
  picker. Save replaces the set (R011).
- I0014-R029: An organization's detail must:
  - show each address's purposes, which are defaults, and a bill-to
    address's delivery method;
  - offer purposes, defaults, and delivery method in the address dialog;
  - show the `billing` role on each of the organization's own emails, with
    a **Billing** action on the email row that opens the same scope and copy choices;
  - show, under each bill-to address, its recipients from R021;
  - show the account owner with a pencil.
- I0014-R030: The directory grids' **Contact type** column must be named
  **Roles** and list system roles. The Labels screen's For filter and
  column must include **Role**.
- I0014-R031: The tenant's **Company** screen (I0013-R026) must list the
  `primary`, `billing`, and `notifications` holders in three groups, each
  with the employee's email and phone. **Change billing contact** is
  removed; roles are set on the employee (R028).

### Rollout

- I0014-R032: Schema changes edit each module's `001-*.js` baseline
  migration in place. A one-time script updates existing development
  databases: it gives every `is_primary_contact` person `primary`, every
  `is_billing_contact` person `billing`, and every customer tenant's
  `primary` employees `notifications`; turns each address labeled `location`
  or `billing` on a vendor or client into that purpose, `billing` as
  `bill_to` with `email`; drops the flags; and rebuilds
  `admin.tenant_contacts`. It does not invent Napsoft client addresses; R020
  applies to later edits.

## 7. Business Rules And Invariants

- The database enforces: one row per holder, role or tag, and scope among
  active rows; exactly one holder and exactly one of role or tag per row;
  `copy_all` only on `billing` with no scope; one active default per
  organization and purpose; a delivery method exactly on `bill_to` rows.
- The module domain enforces the holder rules that span tables: R003, R005,
  R006, R008, R009, R012–R015, R018, R020, and R022.
- Resolution (R021) is the one definition future invoicing and payment use.
  It reads only the organization's own directory rows.
- Labels in the `role` group never change behavior. Address labels stay
  free tags; no rule reads them.

## 8. Lifecycle And State Transitions

| State                             | Event                                    | Result                                            |
| --------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Person holds `billing`            | Archive the person                       | Role ends with the person; restore brings it back |
| Last `billing` holder of a tenant | Archive or remove the role               | `409 LAST_BILLING_CONTACT`                        |
| Bill-to scopes a `billing` role   | Archive the address or drop `bill_to`    | `409 ADDRESS_IN_USE`                              |
| Default `bill_to` among several   | Archive it                               | Oldest other bill-to becomes default              |
| Bill-to `email`                   | Change to `portal`, holder has no portal | `409 CONTACT_DETAILS_REQUIRED`                    |
| Account owner employee active     | Archive the employee                     | Link kept; shown archived                         |

Restoring a person or address restores its roles and purposes, subject to
R006–R010 and R016.

Example: Acme has bill-to addresses Dallas and Austin. Pat is `billing`
scoped to Dallas, the ap@acme.com email is `billing` with `copy_all`, and Sam
is `primary`. A Dallas invoice goes to Pat with a copy to ap@acme.com. An
Austin invoice has no scoped holder and no other `billing` holder, so it goes
to Sam with a copy to ap@acme.com.

## 9. Data Requirements

All tables are in each tenant's cell in the `app` schema, with audit fields,
soft delete, `revision`, and the tenant RLS (row-level security) rule of
M0002-01-R006.

- New `app.contact_roles`: `id`, `tenant_id`, `organization_id` (the
  holder's organization; null for a customer tenant's employee),
  `person_id` (references `people.party_id`, nullable), `contact_method_id` (references
  `contact_methods.id`, nullable), `role` (`primary`, `billing`,
  `notifications`, nullable), `label_id` (references a `role` label,
  nullable), `address_id` (references `addresses.id`, nullable), `copy_all`
  (not null, default `false`). Checks: exactly one of `person_id` and
  `contact_method_id`; exactly one of `role` and `label_id`; `address_id`
  and `copy_all` only with `role = 'billing'`; not both `address_id` and
  `copy_all`; `notifications` only with no organization; an email holds
  only `billing` for an organization. Unique among active rows on holder,
  role or label, and address.
- New `app.address_purposes`: `id`, `tenant_id`, `address_id`, `party_id`
  (the address's organization), `purpose` (`location`, `bill_to`,
  `remit_to`), `is_default`, `delivery_method` (`email`, `mail`, `portal`).
  Checks: `delivery_method` set exactly when `purpose = 'bill_to'`. Unique
  among active rows on (`address_id`, `purpose`) and on (`party_id`,
  `purpose`) where `is_default`.
- `app.organizations`: new `account_owner_id`, nullable, an employee's
  `people.party_id`. It has no foreign key, since `people` is created after
  `organizations`; the domain checks it (R022).
- `app.contact_methods` and `app.addresses`: unique on (`tenant_id`, `id`),
  so the new tables reference them within the tenant.
- `app.people`: `is_primary_contact` and `is_billing_contact` and their
  index are removed.
- `app.contact_labels`: `applies_to` gains `role`.
- `admin.tenant_contacts`: `is_primary_contact`, `is_billing_contact`, and
  `billing_phone` are replaced by `roles text[]`, non-empty, each value a
  system role.

## 10. API Requirements

Business Directory, base `/api/business-directory/v1`:

| Method and route                                             | Route capability                                                     | Errors                                                                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `PUT /{people,organization-contacts}/:id/roles`              | `directory::write`; `company-profile::write` for a tenant's employee | `NOT_FOUND`, `INVALID_INPUT`, `INVALID_STATE`, `STALE_REVISION`, `CONTACT_DETAILS_REQUIRED`, `LAST_*_CONTACT` |
| `PUT /parties/:id/contact-methods/:methodId/roles`           | `directory::write`                                                   | `NOT_FOUND`, `INVALID_INPUT`, `INVALID_STATE`, `STALE_REVISION`, `CONTACT_DETAILS_REQUIRED`                   |
| `POST`, `PATCH /parties/:id/addresses[/:addressId]`          | `directory::write`                                                   | As M0005, plus `CONTACT_DETAILS_REQUIRED`, `ADDRESS_IN_USE`, `LAST_LOCATION`                                  |
| `DELETE /parties/:id/addresses/:addressId`                   | `directory::write`                                                   | As M0005, plus `ADDRESS_IN_USE`, `LAST_LOCATION`                                                              |
| `PATCH /organizations/:id`                                   | `directory::write`                                                   | As M0005, plus `INVALID_STATE` for the account owner                                                          |
| `GET /organizations/:id/recipients`                          | `directory::read`                                                    | `NOT_FOUND`, `INVALID_INPUT`                                                                                  |
| Archive, restore, contact-method writes, `PATCH /people/:id` | As M0005 §10                                                         | Adds `LAST_*_CONTACT`, `CONTACT_DETAILS_REQUIRED`, `ADDRESS_IN_USE`                                           |
| `GET /company-profile`                                       | As I0013                                                             | As I0013                                                                                                      |

- `PUT /people/:id/roles` and `PUT /organization-contacts/:id/roles` take
  `{ "revision": n, "roles": [{ "role": "billing", "addressId": null, "copyAll": false }], "tagIds": ["<uuid>"] }`.
  The contact-method route takes the same body without `tagIds`.
  `revision` is the person's or email's.
- Address bodies gain
  `"purposes": [{ "purpose": "bill_to", "isDefault": true, "deliveryMethod": "email" }]`.
- `PATCH /organizations/:id` gains `accountOwnerId`.
- Record responses gain `roles`, `tags`, address `purposes`, and
  `accountOwner: { id, name, archived }`, and drop `isPrimaryContact` and
  `isBillingContact`.
- `GET /company-profile` returns `primaryContacts`, `billingContacts`, and
  `notificationContacts` in place of `primaryContacts` and `billingContact`.
- `POST /company-profile/billing-contact` is removed. `BILLING_CONTACT` and
  `BILLING_LABEL` are removed; the `billing` phone label is an ordinary label.

Admin Tenancy, base `/api/admin-tenancy/v1`: `GET /tenants/:tenant/contacts`
returns `roles` in place of the flags and billing phone; `POST
/control/provision` takes the R024 body.

## 11. Cross-Module Interactions

- M0005: new tables and columns (§9); R004, R051, and R053 and the label
  groups of R017 are replaced in part.
- I0013: the flags, the one-billing rule, the billing phone, the reassign
  endpoint, and the copy's columns are replaced (R006–R008, R026, R027, R031).
- I0006 and I0013: the provisioning body and client stage gain the address
  (R024).
- I0004: the `tenant_contact` row carries `roles` (R026).
- M0001: `admin.tenant_contacts` changes (§9).
- I0008: portal access is read for R009 and refused removal under R010.

## 12. Security And Audit

- Role, purpose, delivery method, and account owner changes are directory
  writes and write events under M0005-R025.
- The recipients response holds names and emails only, under
  `directory::read`.
- Napsoft still reads tenant contacts only from the admin copy.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                 | Requirements           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| AC01      | Oak gives billing to Ann and Billy; both are listed on Company and in Napsoft's copy with their roles.                                                                          | I0014-R002, R026, R031 |
| AC02      | Removing billing from Oak's last billing holder returns `LAST_BILLING_CONTACT`; the same holds for primary and notifications, and for archive and bulk archive.                 | I0014-R006, R007       |
| AC03      | Setting a role on a standalone contact or a Napsoft employee, or notifications on a client contact, returns `INVALID_STATE`.                                                    | I0014-R005             |
| AC04      | Acme's Dallas invoice resolves to Pat with a copy to ap@acme.com; Austin resolves to Sam with a copy to ap@acme.com; ap@acme.com is never To.                                   | I0014-R012–R014, R021  |
| AC05      | `copy_all` with a scope returns `INVALID_INPUT`; a scope on another organization's address returns `INVALID_STATE`.                                                             | I0014-R013, R014       |
| AC06      | Changing Dallas to `portal` while Pat has no portal access returns `CONTACT_DETAILS_REQUIRED`; removing Pat's only email while Dallas is `email` returns it too.                | I0014-R009, R010       |
| AC07      | Archiving Dallas while Pat is scoped to it returns `ADDRESS_IN_USE`; archiving the default of two bill-to addresses makes the other the default.                                | I0014-R016, R018, R019 |
| AC08      | `remit_to` on a client address returns `INVALID_INPUT`; a vendor's payment questions resolve to its billing holders, else its primary holders.                                  | I0014-R015, R021       |
| AC09      | Provisioning with an address gives the Napsoft client a default location and bill-to; archiving that location returns `LAST_LOCATION`.                                          | I0014-R020, R024       |
| AC10      | A client's account owner shows as Sales rep, a Napsoft client's as Account manager, a vendor's as Account owner; archiving the employee keeps the link marked archived.         | I0014-R022, R023       |
| AC11      | A tenant creates a `role` tag "Sales rep", gives it to a vendor contact, and it shows under Roles; it does not change resolution.                                               | I0014-R004, R021, R028 |
| AC12      | The detail and grids show roles, purposes, defaults, delivery methods, and recipients as R028–R030 describe.                                                                    | I0014-R028–R030        |
| AC13      | After the rollout script, every flagged person holds the matching role, each customer tenant's primary employees hold notifications, and `admin.tenant_contacts` carries roles. | I0014-R032             |

## 14. Outstanding Questions

None blocking. For review, defaults chosen in drafting:

- Napsoft keeps a Napsoft client's addresses (R025), as it keeps the legal
  and DBA name; the tenant does not edit them.
- Napsoft invoices tenants by email, so tenant `billing` holders need a
  primary email and have no scope until Companies (R008, R013).
- An organization email may hold `billing` only (R012).
- Scope applies to `billing` only, not `primary` (R013).

## Verification Evidence

Verified on 2026-11-03 in
[silverstone-i/nap#89](https://github.com/silverstone-i/nap/pull/89).

- `npm run lint`, `npm run format:check`, and `npm run build` pass.
  `npm test` passes: API unit 641, web 346, shared 25, toolchain 25.
  `npm run test:db:local` passes 367, including role holders and minimums
  with bulk archive (AC01–AC03), the Acme Dallas/Austin resolution
  (AC04), scope and `copy_all` refusals (AC05), delivery-method holder
  rules (AC06), `ADDRESS_IN_USE` and default promotion (AC07), remit-to
  (AC08), the Napsoft client's location and its tenant-copy recipients
  (AC09, R021), the account owner (AC10), and role tags (AC11). Web tests
  cover the Roles dialog, address purposes and recipients, the email
  Billing action, the account owner picker, and the Role label group
  (AC12).
- On the dev stack, converted in place by the R032 script: Oak Homes'
  Napsoft client showed Account manager, the tenant contacts with a Roles
  column (Ann: Primary, Notifications; Jeff: Billing), and its migrated
  location address. Adding Bill-to in the address dialog (no Remit-to for
  a client) showed "Bill-to, default, email" and "Invoices to: Jeff
  Billings". The Labels screen offers For: Role.
- The dev check found one gap, fixed here: a Napsoft client's recipients
  came from the Napsoft cell, which holds none of its tenant's people; they
  now come from Napsoft's copy (R026).
