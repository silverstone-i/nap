# I0010: Tenant-Managed Portal Access and Roles

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                                        |
| Type                 | Inter-module workflow                                                                                                                                                                                                                                                                                                                                        |
| Related architecture | [Admin and cells](../../architecture/admin-cells.md)                                                                                                                                                                                                                                                                                                         |
| Related PRDs         | [I0008: Portal Access](I0008-portal-access.md), [M0005: Business Directory](../modules/M0005-business-directory.md), [M0003: Access Control](../modules/M0003-access-control.md), [I0004: Admin-Cell Sync](I0004-admin-cell-sync.md), [I0005: RBAC Decision Model](I0005-rbac-decision-model.md), [I0006: Tenant Provisioning](I0006-tenant-provisioning.md) |
| Related decisions    | A tenant's own administrators decide who uses the portal and with which roles. Napsoft sets only the first `tenant_admin`, at provisioning. Roles are chosen when access is turned on and changed by editing the person.                                                                                                                                     |
| Last reviewed        | 2026-10-09                                                                                                                                                                                                                                                                                                                                                   |

## 2. Purpose

Turning portal access on today gives a person a login with no roles; someone
must then find them on the Roles screen. This workflow puts the access
switch and the role choice in the person's create and edit dialog, so the
tenant administrator who grants access also decides what the person can do,
in one step.

## 3. Scope

### Included

- Portal access, temporary password, and role selection in the create and
  edit dialog of employees, contacts, vendor contacts, and client contacts.
- Holding the chosen roles until the person's membership becomes active,
  then assigning them.
- Changing a person's roles by editing the person.
- Limiting these changes to the tenant's own users.

### Excluded

- The portal-access request, status, retry, and Napsoft login recovery:
  I0008, unchanged except where §11 says.
- The first `tenant_admin` and its role, which tenant provisioning creates
  (I0006, M0003-R009, M0005-R022).
- Role definitions and the Roles screen (M0003-R016), which stay as they
  are.
- The deferred simplified role model. This PRD uses today's M0003 tables;
  moving them changes where roles are stored, not this workflow.

## 4. Actors And Permissions

| Context                                      | Actor                                  | Required capabilities                                                                               | Required state        | Result                                 |
| -------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------- |
| Turn access on, with roles                   | Tenant user of the same tenant         | `<TENANT>::business-directory::directory::write` and `<TENANT>::access-control::assignments::write` | I0008-R003 holds      | Request queued; roles held (R006)      |
| Change a person's roles                      | Tenant user of the same tenant         | `<TENANT>::business-directory::directory::write` and `<TENANT>::access-control::assignments::write` | Access on             | Roles changed or held                  |
| Turn access off                              | Tenant user of the same tenant         | `<TENANT>::business-directory::directory::write`                                                    | I0008-R005, R006 hold | Request queued; roles kept (R010)      |
| See a person's roles                         | Tenant user                            | `<TENANT>::access-control::roles::read`                                                             | Any                   | Roles shown                            |
| Any change above from another tenant's login | Napsoft operator or other outside user | —                                                                                                   | Home tenant ≠ target  | `403 FORBIDDEN`                        |
| Any of the above without the capabilities    | Caller                                 | —                                                                                                   | Any                   | `403 FORBIDDEN`, or the control hidden |

`tenant_admin` holds every tenant capability through `<CODE>::*::*::*`.

## 5. Concepts And Terminology

| Term          | Meaning                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Person        | An `app.people` row that can hold a login: employee, contact, vendor contact, or client contact (M0005)                      |
| Active member | A person whose membership copy in `cell.tenant_members` is `active` (I0008-R008); M0003 assigns roles only to active members |
| Held role     | A role chosen for a person who is not yet an active member, waiting to be assigned                                           |
| Assigned role | An `app.role_assignments` row for the person's login (M0003-R006)                                                            |
| Home tenant   | The tenant whose cell holds the caller's own roles (I0005)                                                                   |

## 6. Functional Requirements

### The dialog

- I0010-R001: The create and edit dialog of a person must show **Portal
  access**, a temporary password field while access is being turned on, and
  a **Roles** multi-select, when the session holds both
  `business-directory::directory::write` and
  `access-control::assignments::write` for the tenant. Without both, these
  controls are hidden.
- I0010-R002: **Roles** must list the tenant's unarchived roles that the
  caller may assign under M0003-R011. A person can hold several roles.
- I0010-R003: The dialog must show which of a person's roles are held
  rather than assigned, with the note "Applies when this person first signs
  in."
- I0010-R004: The detail view keeps I0008's status and **Retry** and shows
  the person's roles. Its portal-access switch moves to the dialog.

### Turning access on

- I0010-R005: Turning access on must require at least one role. With none,
  the save fails with `INVALID_INPUT` and sends no request.
- I0010-R006: When the person is not an active member, the chosen roles must
  be held, in the same cell transaction as the person save and the I0008
  request.
- I0010-R007: When the person's membership copy becomes `active` (I0004
  copying the membership, or I0008-R012 activating it), the cell must, in the
  same transaction as the copy, assign every held role to the person's login
  and clear the held roles. Each assignment writes M0003-R015's outbox row.
- I0010-R008: A held role archived before R007 runs is still assigned and
  grants nothing until restored (M0003-R014).

### Changing roles

- I0010-R009: Saving a person whose access is on with a changed role set
  must, in one cell transaction, assign added roles and remove dropped roles
  for an active member, or replace the held roles for anyone else. M0003's
  rules apply: `GRANT_EXCEEDS_ACTOR` (R011) and `LAST_ADMIN` (R012). Removing
  every role fails with `INVALID_INPUT`. A failure changes nothing.
- I0010-R010: Turning access off, or archiving the person, keeps the
  person's assigned and held roles. They grant nothing while the membership
  is suspended, and apply again if access is turned back on, where R005 is
  met by the kept roles.

### Who may change it

- I0010-R011: Turning access on, changing roles, and the role fields in the
  request must be refused with `FORBIDDEN` when the caller's home tenant is
  not the target tenant. This is checked on the server in addition to the
  capabilities.
- I0010-R012: The role fields require `access-control::assignments::write`.
  A request that sends them without it fails with `FORBIDDEN` and changes
  nothing.

## 7. Business Rules And Invariants

- A person with access on always has at least one assigned or held role
  (R005, R009).
- A person has held roles only while not an active member; R007 empties
  them on activation.
- The person save, the held or assigned roles, and the I0008 request commit
  together or not at all.
- Napsoft's only part is the first `tenant_admin` at provisioning; every
  later access and role decision is the tenant's (R011).

## 8. Lifecycle And State Transitions

| Person state                        | Event                            | Roles                               |
| ----------------------------------- | -------------------------------- | ----------------------------------- |
| Access off                          | Turn on with roles               | Held                                |
| Access on, not yet an active member | Change roles                     | Held set replaced                   |
| Access on, not yet an active member | Membership copy becomes `active` | Held roles assigned; held set empty |
| Active member                       | Change roles                     | Assignments added and removed       |
| Access on                           | Turn off or archive              | Kept; grant nothing while suspended |
| Access off with kept roles          | Turn on                          | Kept roles apply when active again  |

Portal-access status follows I0008 §8.

## 9. Data Requirements

- Held roles are stored in the tenant's cell, owned by Access Control,
  keyed by tenant, the person's party ID, and role ID, unique per active
  triple, with soft delete and audit fields.
- Assignments stay in `app.role_assignments` (M0003-R006).
- The workflow writes `app.people.is_portal_user` and `cell.outbox`
  through I0008, and role assignments through M0003.

## 10. API Requirements

Business Directory, base `/api/business-directory/v1`:

| Method and route                                  | Change                                                                                                        | Errors                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `POST /people`                                    | With `isPortalUser: true`, requires `roleIds` (one or more UUIDs) beside `temporaryPassword`                  | `INVALID_INPUT`, `NOT_FOUND`, `GRANT_EXCEEDS_ACTOR`, `FORBIDDEN`                               |
| `PATCH /people/:id`, `/organization-contacts/:id` | Accepts `roleIds`; required when turning access on; replaces the role set while access is on                  | `INVALID_INPUT`, `NOT_FOUND`, `GRANT_EXCEEDS_ACTOR`, `LAST_ADMIN`, `FORBIDDEN`, I0008's errors |
| `GET` detail of people and contacts               | Each person includes `roles: [{ id, code, name, held }]` when the session holds `access-control::roles::read` | —                                                                                              |

`roleIds` sent while access is off and not being turned on fails with
`INVALID_INPUT`. Access Control's `/users/:userId/roles` routes are
unchanged and still serve the Roles screen.

## 11. Cross-Module Interactions

- I0008: turning access on now also needs `access-control::assignments::write`
  and at least one role. This replaces I0008's exclusion "assigning the new
  member a role: done on the Roles screen", and moves its switch from the
  detail view to the dialog (R004).
- M0005 owns people and their routes; this PRD adds `roleIds` and `roles` to
  them.
- M0003 owns roles and assignments; R007 and R009 assign and remove through
  its rules, and held roles are a new Access Control record (§9).
- I0004 copies the membership into `cell.tenant_members`; R007 runs in that
  apply transaction.
- I0005 supplies the home tenant for R011 and invalidates cached
  capabilities after each assignment change.

## 12. Security And Audit

- Every assignment added or removed, including those R007 makes, writes
  M0003-R015's event with actor, tenant, role, and before and after values.
  R007's actor is the user who chose the roles.
- Holding or changing held roles writes an event with the same fields.
- No temporary password appears in any role record or event (I0008 §7).

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                      | Requirements           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| AC01      | A tenant admin creates an employee with access on and two roles; after the person changes the temporary password, both roles are assigned and the held set is empty. | I0010-R001, R006, R007 |
| AC02      | Turning access on without a role fails with `INVALID_INPUT`, writes no request, and holds no role.                                                                   | I0010-R005             |
| AC03      | The dialog lists only roles the caller may assign and marks held roles with the first-sign-in note.                                                                  | I0010-R002, R003       |
| AC04      | Editing an active member adds and removes assignments; removing the last role, or the tenant's last `tenant_admin`, fails and changes nothing.                       | I0010-R009             |
| AC05      | Editing a not-yet-active person replaces the held roles without touching `app.role_assignments`.                                                                     | I0010-R009             |
| AC06      | Turning access off keeps the roles; turning it back on with no new roles succeeds and the kept roles apply on activation.                                            | I0010-R010             |
| AC07      | A user with `directory::write` but not `assignments::write` sees no portal or role controls and gets `403` when sending `roleIds`.                                   | I0010-R001, R012       |
| AC08      | A Napsoft operator working in a customer tenant gets `403` turning access on or changing roles there.                                                                | I0010-R011             |
| AC09      | A held role archived before activation is assigned on activation and grants nothing until restored.                                                                  | I0010-R008             |
| AC10      | The detail view shows status, Retry, and roles, with no portal-access switch.                                                                                        | I0010-R004             |

## 14. Outstanding Questions

None.
