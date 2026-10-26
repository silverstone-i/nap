# I0012: Party Memberships

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Type                 | Inter-module workflow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Related architecture | [Admin and cells](../../architecture/admin-cells.md), [BFF](../../architecture/bff.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Related PRDs         | [I0008: Portal Access](I0008-portal-access.md), [I0010: Tenant-Managed Portal Access and Roles](I0010-tenant-portal-access-roles.md), [I0004: Admin-Cell Sync](I0004-admin-cell-sync.md), [I0005: RBAC Decision Model](I0005-rbac-decision-model.md), [M0001-09: Tenant Selection](../modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md), [M0001-04: Session Management](../modules/M0001-admin-tenancy/M0001-04-session-management.md), [M0003: Access Control](../modules/M0003-access-control.md), [M0005: Business Directory](../modules/M0005-business-directory.md), [M0006-03: Member Profiles](../modules/M0006-tenant-settings/M0006-03-member-profiles.md) |
| Related decisions    | One login per email. A login holds one membership per party in a tenant. A session acts as exactly one membership; permissions from different parties are never combined.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Last reviewed        | 2026-10-25                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## 2. Purpose

A person can be more than one party in the same tenant, such as an employee
who is also a vendor contact. Today a login holds one membership per tenant,
so turning portal access on for the second party fails with
`MEMBER_CONFLICT`. This workflow lets one login hold a membership for each of
its parties, has the user pick a tenant and party at sign-in, and makes every
permission check use only the picked party's roles. A user acting as a client
never gets an employee's access.

## 3. Scope

### Included

- Several memberships per login and tenant, one per party.
- Applying portal-access requests per party.
- A sign-in picker that lists one entry per tenant and party, and switching
  between entries.
- Sessions bound to one membership.
- Role assignments and capability checks per membership.
- Migrating existing memberships, sessions, and role assignments.

### Excluded

- Which party categories may hold portal access. Today employees, contacts,
  vendor contacts, and client contacts can (I0008 §5).
- Tax ID uniqueness within a tenant and party category.
- Combining several parties' permissions in one session.
- Emailed invitations and set-password links (I0008 §3).

## 4. Actors And Permissions

| Context                                      | Actor            | Required capability                  | Required state                                          | Result                                 |
| -------------------------------------------- | ---------------- | ------------------------------------ | ------------------------------------------------------- | -------------------------------------- |
| List own selectable entries                  | Portal user      | None beyond a session                | Any                                                     | One entry per eligible membership      |
| Select an entry                              | Portal user      | None beyond a session                | Own membership is active and ready; M0001-09-R001 holds | Session acts as that membership        |
| Turn access on or off for a party            | Tenant user      | I0008 §4 and I0010 §4, unchanged     | I0008 and I0010 rules hold; R018, R019                  | Request queued for that party only     |
| Any request in a session                     | Portal user      | The route's capability               | Session has a selected membership                       | Decided on that membership's roles     |
| View a login's memberships                   | Napsoft operator | `NAP::admin-tenancy::accounts::read` | Any                                                     | Every membership, with its party label |
| Select a membership that is not the caller's | Portal user      | —                                    | Any                                                     | `403 FORBIDDEN`; session unchanged     |

## 5. Concepts And Terminology

| Term                | Meaning                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Party               | A directory record that can hold portal access: an `app.people` row of kind employee, contact, vendor contact, or client contact (M0005) |
| Login               | An `admin.portal_users` row; one per email                                                                                               |
| Membership          | An `admin.portal_user_tenants` row linking one login to one party in one tenant; its `member_id` is the party ID                         |
| Membership copy     | The `cell.tenant_members` row with the same ID as the membership (I0004)                                                                 |
| Party label         | Short text naming the party in the picker: "Employee", "Contact", "Vendor · {organization name}", or "Client · {organization name}"      |
| Selected membership | The membership a session acts as; it fixes the tenant, the party, and the roles for every request in that session                        |

## 6. Functional Requirements

### Memberships

- I0012-R001: A login must be able to hold several unarchived memberships in
  one tenant, at most one per party.
- I0012-R002: A party must have at most one pending or active membership.
- I0012-R003: Applying a portal-access request (I0004-R024–R032, I0008) must
  find the membership by login, tenant, and party. When the login has no
  membership for that party, the apply creates one. A membership of the same
  login for another party in the tenant is not a conflict.
- I0012-R004: Applying must fail with `MEMBER_CONFLICT` only when R002 would
  be broken: the party already has a pending or active membership of another
  login.
- I0012-R005: A new membership must start `active` and ready when the login
  already has any active membership, in this tenant or another. Otherwise it
  starts `pending` (I0008-R012 activates it). This extends I0008's
  "active elsewhere" rule to the same tenant.
- I0012-R006: Turning a party's access off, or archiving the party, must
  suspend only that party's membership and revoke only sessions whose
  selected membership is that one.
- I0012-R007: Each membership must carry its party label. The portal-access
  request sends it, and renaming a vendor or client organization must queue
  an update for every membership of its contacts.

### Selection

- I0012-R008: `GET /access/tenants` must return one entry per active, ready
  membership of the caller in an eligible tenant (M0001-09 §7), with the
  membership ID, tenant ID, code, and name, the member type, and the party
  label.
- I0012-R009: `POST /access/select` must take a membership ID. It must run
  M0001-09-R001's checks against that membership, refuse a membership of
  another login with `FORBIDDEN`, and on success store the membership and
  its tenant on the session.
- I0012-R010: When the caller has exactly one entry, the web app must select
  it without showing the picker. Otherwise the picker must list every entry,
  grouped by tenant, each showing the tenant name and the party label.
- I0012-R011: Switching tenant from the shell must open the same picker,
  including the caller's other parties in the current tenant. Selecting an
  entry follows M0001-09 §8: a new session token and the new membership.
- I0012-R012: The shell must show the selected party label beside the tenant
  name whenever the caller has more than one entry in that tenant.

### Authorization

- I0012-R013: A role assignment must belong to a membership, not to a login.
  A membership can hold several roles; a role is assigned to a membership
  once.
- I0012-R014: Capability checks (I0005) must load roles from the session's
  selected membership only. A session with no selected membership has no
  tenant roles.
- I0012-R015: A login that holds an active Napsoft membership keeps Napsoft
  as its home tenant (I0005), with roles from that membership. A login must
  hold at most one Napsoft membership.
- I0012-R016: Held roles (I0010-R006) stay keyed by party. On activation
  (I0010-R007) they must be assigned to that party's membership.
- I0012-R017: Role changes from the person dialog (I0010-R009) and the Roles
  screen must act on the party's membership. _Superseded in part by
  M0003-R021 (the Roles screen no longer assigns roles) and I0010-R013 (the
  person's roles change from the detail's portal access dialog)._
- I0012-R018: I0008-R005's administrator guard must check the roles of the
  membership being turned off, not the login's roles in other memberships.
- I0012-R019: I0008-R006's self guard must refuse turning off or archiving
  any party whose membership belongs to the caller's login in this tenant.

### Recovery and schema rollout

- I0012-R020: The Napsoft membership view (I0008-R013) must show one row per
  membership with the party label.
- I0012-R021: The schema changes edit the `001-admin-tenancy`,
  `001-cell-tenancy`, and `001-access-control` migrations in place, so
  existing admin and cell databases are recreated; no data is migrated.
  Bootstrap and provisioning must give the bootstrap login and each first
  `tenant_admin` the same access and roles as before. The bootstrap login's
  Napsoft membership has no party and holds its roles like any other.

## 7. Business Rules And Invariants

- R001 and R002 are database constraints in admin. Each cell's membership
  copy enforces R001; it does not enforce R002, because the sync worker
  applies one membership at a time and could briefly see a party's old and
  new holder together.
- A session's selected membership belongs to the session's login and tenant,
  checked at selection (R009).
- Permissions in one session come from one membership (R014).
- R003–R007 run in the admin apply transaction; R016–R019 run in the cell
  transaction that writes the request or the assignment.

## 8. Lifecycle And State Transitions

| Login state in tenant      | Event                          | Result                                                    |
| -------------------------- | ------------------------------ | --------------------------------------------------------- |
| No membership              | Party A access on              | Membership A `pending`, or `active` if active elsewhere   |
| Membership A active        | Party B access on              | Membership B `active` and ready (R005)                    |
| Memberships A and B active | Sign in                        | Picker shows A and B                                      |
| Session acting as A        | Select B                       | New token; session acts as B                              |
| Session acting as A        | Party A access off or archived | Membership A suspended; A's sessions revoked; B untouched |
| Memberships A and B active | Party B access off             | Picker shows only A; next sign-in selects A automatically |

Membership status otherwise follows I0004 §8 and I0008 §8.

## 9. Data Requirements

- `admin.portal_user_tenants`: unique per login, tenant, and party among
  unarchived rows, replacing unique per login and tenant; at most one
  pending or active row per party (R002); new `member_label` (R007).
- `cell.tenant_members`: the same uniqueness and `member_label`, kept in step
  by I0004.
- `admin.sessions`: new `membership_id`, set with `tenant_id` on selection.
- `app.role_assignments`: keyed by membership (the membership copy's ID)
  instead of `portal_user_id`; unique per membership and role.
- `app.held_roles`: unchanged.
- Member profiles (M0006-03) are already keyed by membership and need no
  change.

## 10. API Requirements

Admin Tenancy, base `/api/admin-tenancy/v1`:

| Method and route                      | Change                                                                                      | Errors                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `GET /access/tenants`                 | One entry per membership: `{ membershipId, tenant: { id, code, name }, memberType, label }` | —                                                          |
| `POST /access/select`                 | Body `{ membership }` replaces `{ tenant }`                                                 | `INVALID_INPUT`, `FORBIDDEN`, `CELL_UNAVAILABLE`, as today |
| `GET /accounts/users/:id/memberships` | Each row adds `label`                                                                       | —                                                          |

The session view returned by sign-in, selection, and session reads adds
`membership: { id, memberType, label }`.

Access Control's `/users/:userId/roles` routes become
`/memberships/:membershipId/roles`; the Roles screen passes the party's
membership. _Superseded in part by M0003-R021: the Roles screen no longer
assigns roles, so the list `GET /memberships` it used is removed; the
`/memberships/:membershipId/roles` routes stay._

## 11. Cross-Module Interactions

- M0001-09: selection takes a membership; its eligibility rules are
  unchanged.
- M0001-04: sessions store the selected membership; revocation can target
  one membership (R006).
- I0004: the portal-access payload carries the party label; the apply finds
  memberships by party (R003); a new outbox row type updates labels (R007).
- I0005: patterns load per membership; the cache key changes from login to
  membership (R014).
- I0008: the conflict rule, the activation rule, and both guards change as
  R004, R005, R018, and R019 state.
- I0010: held roles assign to the party's membership (R016, R017).
- M0003: assignments are keyed by membership (R013).
- M0005: renaming an organization queues the label update (R007).

## 12. Security And Audit

- Selection success and failure record the membership as well as the tenant
  (M0001-09 §12).
- Role assignment events (M0003-R015) record the membership.
- A session never holds patterns from a membership other than its selected
  one, so a client session cannot call an employee route even when the same
  login is an employee in that tenant.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                           | Requirements           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| AC01      | Turning access on for an employee and a vendor contact with the same email in one tenant succeeds; the second membership is active at once.               | I0012-R001, R003, R005 |
| AC02      | Turning access on for a party that already has another login's active membership fails with `MEMBER_CONFLICT`.                                            | I0012-R002, R004       |
| AC03      | The picker shows "Acme · Employee" and "Acme · Vendor · Black Plumbing"; with one entry the app selects it without the picker.                            | I0012-R008, R010       |
| AC04      | Acting as the vendor contact, an employee-only route returns `403`; after switching to the employee entry it succeeds.                                    | I0012-R011, R014       |
| AC05      | Selecting another login's membership returns `403` and leaves the session unchanged.                                                                      | I0012-R009             |
| AC06      | Turning off the vendor contact's access revokes only sessions acting as it; the employee session continues.                                               | I0012-R006             |
| AC07      | Roles chosen for the vendor contact are assigned to its membership on activation and grant nothing in the employee session.                               | I0012-R013, R016, R017 |
| AC08      | Renaming the vendor organization updates the picker label.                                                                                                | I0012-R007             |
| AC09      | A user cannot turn off or archive any of their own parties in the tenant; the administrator guard checks only the membership being turned off.            | I0012-R018, R019       |
| AC10      | On a recreated stack, the bootstrap login keeps Napsoft access with `platform_admin`, and a provisioned tenant's first administrator gets `tenant_admin`. | I0012-R015, R021       |
| AC11      | The Napsoft membership view lists each membership with its party label.                                                                                   | I0012-R020             |

## 14. Outstanding Questions

None.

## Verification Evidence

Verified on 2026-10-26 in
[silverstone-i/nap#72](https://github.com/silverstone-i/nap/pull/72); its CI
checks (changelog, checks, roadmap) pass.

- `npm run lint`, `npm run format:check`, and `npm run build` pass. `npm test`
  passes: API unit 614, web 276, shared 20, toolchain 25. `npm run
test:db:local` passes 325, including new cases for a second party of an
  active login getting its own active membership (AC01), a party held by
  another login failing with `MEMBER_CONFLICT` (AC02), one picker entry per
  party (AC03), refusing another login's membership (AC05), relabelling on
  rename (AC08), a second Napsoft membership being refused (R015), and
  `GET /memberships` naming the person and party for the Roles screen (R017),
  added after review found the names were read outside the tenant
  transaction.
- Unit tests cover a customer-tenant session with no selected membership
  resolving no patterns (R014), the administrator guard ignoring the login's
  roles on another membership (R018), and the picker, header label, Roles
  screen, and memberships dialog in the web app (AC03, AC11).
- On a recreated dev stack: root provisioned Oak Homes, whose administrator
  created an employee and a Black Plumbing LLC vendor contact for
  `jack@oak.test`, each with its own role. Jack's first password change
  activated both, and the picker listed "Oak Homes · Employee" and "Oak Homes ·
  Vendor · Black Plumbing LLC". Acting as the vendor contact, the header showed
  the party label, the session held only `OAK::tenant-settings::general::read`,
  and `GET /people?kind=employee` returned `403`; switching to the employee
  entry returned `200` (AC03, AC04). Setting the vendor's DBA name relabelled
  the picker entry "Vendor · Black Plumbing" (AC08). Turning off the vendor
  contact's access suspended only that membership; the employee session kept
  working and the picker listed only the employee entry (AC06). The Napsoft
  membership view listed both of Jack's memberships with their labels (AC11),
  and root kept Napsoft access with `platform_admin` (AC10).
