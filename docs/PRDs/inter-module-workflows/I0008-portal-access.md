# I0008: Portal Access

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Type                 | Inter-module workflow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Related architecture | [Admin and cells](../../architecture/admin-cells.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Related PRDs         | [M0005: Business Directory](../modules/M0005-business-directory.md), [I0004: Admin-Cell Sync](I0004-admin-cell-sync.md), [M0001-03: Authentication](../modules/M0001-admin-tenancy/M0001-03-authentication.md), [M0001-04: Session Management](../modules/M0001-admin-tenancy/M0001-04-session-management.md), [M0001-08: Portal-User and Membership Administration](../modules/M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md), [M0001-09: Tenant Selection](../modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md), [M0003: Access Control](../modules/M0003-access-control.md) |
| Related decisions    | Portal access is driven from the tenant's person record. A tenant cannot overwrite an unused temporary password.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Last reviewed        | 2026-10-01                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 2. Purpose

A tenant decides which of its people can sign in. Turning **Portal access** on
for a person in the directory gives that person a login and a membership in
the tenant; turning it off or archiving the person takes the membership away.
The tenant sees whether each request has been applied. Napsoft staff recover
logins that a tenant cannot fix: reset a forgotten password, unlock a
throttled login, and re-enable a disabled one.

## 3. Scope

### Included

- Sending a portal-access request when a person's `is_portal_user` flag
  changes or the person is archived.
- Showing each person's portal-access status in the directory.
- Making a membership created by portal access selectable once active.
- Activating every pending membership of a login on its first password
  change.
- Napsoft recovery: view a login's memberships, reset its password, unlock
  it, and disable or re-enable it.

### Excluded

- Applying requests in the admin database: I0004-R024–R032.
- Assigning the new member a role: done on the Roles screen (M0003-R016).
- Tenant suspend, archive, and reinstate, and their effect on portal access.
- Changing a login's email. M0001-08's `PATCH /accounts/users/:id` keeps that.
- Emailed invitations and set-password links. The tenant supplies a temporary
  password until email delivery exists.
- Retiring M0001-08's admin-first membership creation and
  `admin.provisioning_jobs`.

## 4. Actors And Permissions

| Context                                       | Actor                         | Required capability                              | Required state                                   | Result                                 |
| --------------------------------------------- | ----------------------------- | ------------------------------------------------ | ------------------------------------------------ | -------------------------------------- |
| Turn a person's access on, off, or retry      | Tenant user                   | `<TENANT>::business-directory::directory::write` | Person active; R003–R006 hold                    | Flag saved; request queued             |
| Archive a person whose access is on           | Tenant user                   | `<TENANT>::business-directory::directory::write` | R005 and R006 hold                               | Archived; flag off; off request queued |
| See a person's portal-access status           | Tenant user                   | `<TENANT>::business-directory::directory::read`  | Any                                              | Status shown                           |
| View a login's memberships                    | Napsoft operator              | `NAP::admin-tenancy::accounts::read`             | Any                                              | Membership list                        |
| Reset password, unlock, disable, or re-enable | Napsoft operator              | `NAP::admin-tenancy::accounts::write`            | Login is not the bootstrap login (M0001-08-R007) | Login changed                          |
| Any of the above                              | Caller without the capability | —                                                | Any                                              | `403 FORBIDDEN`                        |

`tenant_admin` holds the tenant capabilities through `<CODE>::*::*::*`.
`platform_admin` holds the Napsoft ones. `support` holds only
`*::*::*::read`, and tenant `*` never covers Napsoft (M0003), so it can
neither view memberships nor recover a login.

## 5. Concepts And Terminology

| Term                  | Meaning                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Person                | An `app.people` row: employee, contact, vendor contact, or client contact (M0005)                            |
| Login                 | An `admin.portal_users` row: email, password hash, and account status                                        |
| Membership            | An `admin.portal_user_tenants` row linking one login to one tenant; its `member_id` is the person's party ID |
| Portal-access request | A `portal_access` row in `cell.outbox` asking admin to turn a person's access on or off (I0004-R020)         |
| Pending invitation    | A login whose temporary password has not been changed (`must_change_password = true`)                        |
| Throttle              | A lock on a login after five failed sign-ins in 15 minutes (M0001-03)                                        |

## 6. Functional Requirements

### Sending requests

- I0008-R001: Saving a person with `is_portal_user` changed from false to true
  must call `requestPortalAccess` (I0004-R020) in the same cell transaction,
  with `enabled = true`, the person's party ID as `memberId`, its `kind` as
  `memberType`, its primary email, and the temporary password from the
  request.
- I0008-R002: Saving a person with `is_portal_user` changed from true to
  false, or archiving a person whose flag is true, must call
  `requestPortalAccess` with `enabled = false` in the same transaction.
  Archiving also sets the flag to false. Restoring a person leaves it false.
- I0008-R003: Turning access on must fail with `INVALID_INPUT` when the
  person has no primary email or the request has no `temporaryPassword`. The
  temporary password follows M0001-08's rule (nonempty, at most 128
  characters). A vendor or client contact is created without an email, so
  its access can be turned on only by editing it after it has one.
- I0008-R004: A save that does not change the flag sends no request and
  ignores any `temporaryPassword`.
- I0008-R005: Turning off access, or archiving a person, must fail with
  `ADMIN_ASSIGNED` when the person's login holds `tenant_admin`, or
  `platform_admin` in the Napsoft tenant, as an active assignment in this
  cell. This is M0001-08-R008 checked where the request starts.
- I0008-R006: A user must not turn off their own access or archive
  themselves; the request fails with `INVALID_STATE`.
- I0008-R007: **Retry** on a person whose status is `failed` (R008) must send
  a new on or off request matching the current flag. A retried on request
  requires a new temporary password.

### Showing status

- I0008-R008: Directory list and detail responses for a person must include
  `portalAccess`, derived from cell data only. The first matching row wins:

  | Condition                                                | `portalAccess`                              |
  | -------------------------------------------------------- | ------------------------------------------- |
  | The person's latest `portal_access` request is `pending` | `requested`                                 |
  | The latest request is `failed`                           | `failed`, with the request's `failure_code` |
  | Flag false                                               | `off`                                       |
  | Flag true; membership copy `active`                      | `on`                                        |
  | Flag true; membership copy `pending`                     | `invited`                                   |
  | Flag true; otherwise (the copy has not arrived yet)      | `requested`                                 |

  The membership copy is the unarchived `cell.tenant_members` row with the
  person's ID as `member_id`. A tenant's first administrator has no request
  row and gets their status from the copy.

- I0008-R009: The person's form and detail view must show the status, and the
  failure reason in plain words: `LOGIN_UNAVAILABLE` as "This login is
  disabled. Ask Napsoft support to re-enable it." and `MEMBER_CONFLICT` as
  "This email's login already belongs to another person in this tenant." Any
  other code shows "Contact Napsoft support."
- I0008-R010: The `invited` status must say the person has not signed in
  yet, and that a person who already had a pending invitation from another
  organization signs in with that earlier temporary password.

### Login and membership lifecycle

- I0008-R011: A membership the portal-access apply makes `active` must have
  `ready = true`, because its `member_id` is the person's ID and the person
  already exists. This makes the tenant selectable under M0001-09. A
  `pending` membership stays not ready until R012 activates it.
- I0008-R012: A password change that clears `must_change_password` must, in
  the same admin transaction (M0001-03-R006), set every `pending`, unarchived
  membership of that login to `active`, with `ready = true` when it has a
  `member_id`. Each change writes its membership
  outbox row (I0004-R010), so the cell copies follow. A change that does not
  clear the flag leaves memberships alone.

### Napsoft recovery

- I0008-R013: The Portal Users screen must show, for a selected login, every
  membership: tenant code and name, member type, and status.
- I0008-R014: **Reset password** must set a temporary password supplied by the
  operator, set `must_change_password = true`, and revoke every session of the
  login. Membership statuses do not change.
- I0008-R015: **Unlock** must delete the login's account throttle row
  (M0001-03). Client-address throttles are not tied to a login and are not
  cleared.
- I0008-R016: **Disable** and **Re-enable** must call M0001-08's status
  update. Disable keeps M0001-08-R008's administrator guard and revokes every
  session. Re-enabling a login does not resend a failed request; the tenant
  uses **Retry** (R007).
- I0008-R017: Each recovery action must be refused for the bootstrap login
  (M0001-08-R007) with `ROOT_IMMUTABLE`.

### Email changes

- I0008-R018: While a person's `is_portal_user` is true, any change to their
  primary email must fail with `INVALID_STATE`: adding a new primary email,
  editing it, making another email primary, or archiving it. The login keeps
  the email it was created with, so the tenant turns access off, changes the
  email, and turns access on again with a new temporary password.

## 7. Business Rules And Invariants

- A temporary password is never stored in plain text in the cell, the outbox,
  logs, or events (I0004-R022).
- R003, R005, R006, and R018 are checked in the cell transaction that writes the
  request (module domain). R012 runs in the admin password-change transaction.

## 8. Lifecycle And State Transitions

Portal-access status, as the tenant sees it:

| Status          | Event                                   | Next status             |
| --------------- | --------------------------------------- | ----------------------- |
| `off`           | Turn on                                 | `requested`             |
| `requested`     | Applied; login has an active membership | `on`                    |
| `requested`     | Applied; otherwise                      | `invited`               |
| `requested`     | Applied with a row failure (I0004-R032) | `failed`                |
| `invited`       | Person changes their temporary password | `on`                    |
| `on`, `invited` | Turn off or archive                     | `requested`, then `off` |
| `failed`        | Retry                                   | `requested`             |

Membership changes follow I0004 §8 and R012.

## 9. Data Requirements

No schema change. This workflow writes:

- `app.people.is_portal_user`, through M0005's routes;
- `cell.outbox` `portal_access` rows, through `requestPortalAccess`;
- `admin.portal_user_tenants.status` and `ready` (R011, R012);
- `admin.portal_users.password_hash`, `must_change_password`, and `status`
  (R014, R016);
- `admin.login_throttles`, deleting one row (R015).

It reads `cell.tenant_members`, `cell.outbox`, `app.contact_methods`, and
`app.role_assignments` in the cell, and memberships and tenants in admin.

## 10. API Requirements

Business Directory, base `/api/business-directory/v1`:

| Method and route                                                            | Change                                                                       | Errors                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `POST /people`                                                              | Accepts `temporaryPassword` with `isPortalUser: true`                        | `INVALID_INPUT`                                            |
| `PATCH /people/:id`, `/organization-contacts/:id`                           | Accepts `temporaryPassword`; sends a request when the flag changes           | `INVALID_INPUT`, `ADMIN_ASSIGNED`, `INVALID_STATE`         |
| `POST /organization-contacts`, `POST /organizations` with nested `contacts` | `isPortalUser: true` fails (R003)                                            | `INVALID_INPUT`                                            |
| `POST /{collection}/:id/archive`                                            | Turns access off (R002)                                                      | `ADMIN_ASSIGNED`, `INVALID_STATE`                          |
| `POST /{collection}/:id/portal-access/retry`                                | Resends the request (R007); body `{ temporaryPassword }` when the flag is on | `INVALID_STATE` unless status is `failed`; `INVALID_INPUT` |
| `POST`, `PATCH`, `DELETE /parties/:id/contact-methods[/:methodId]`          | Rejects a primary-email change while the flag is true (R018)                 | `INVALID_STATE`                                            |
| `GET` list and detail of people and contacts                                | Each person includes `portalAccess: { status, failureCode }`                 | —                                                          |

The retry route requires `business-directory::directory::write`.

Admin Tenancy, base `/api/admin-tenancy/v1`:

| Method and route                          | Capability                            | Body                    | Errors                                         |
| ----------------------------------------- | ------------------------------------- | ----------------------- | ---------------------------------------------- |
| `GET /accounts/users/:id/memberships`     | `NAP::admin-tenancy::accounts::read`  | —                       | `NOT_FOUND`                                    |
| `POST /accounts/users/:id/password-reset` | `NAP::admin-tenancy::accounts::write` | `{ temporaryPassword }` | `NOT_FOUND`, `INVALID_INPUT`, `ROOT_IMMUTABLE` |
| `POST /accounts/users/:id/unlock`         | `NAP::admin-tenancy::accounts::write` | —                       | `NOT_FOUND`, `ROOT_IMMUTABLE`                  |

Disable and re-enable use the existing `PATCH /accounts/users/:id`.
`temporaryPassword` is never returned in a response.

## 11. Cross-Module Interactions

- M0005 owns `app.people` and its routes; this PRD adds the request call,
  `portalAccess` status, and retry to them, and replaces M0005-R020.
- I0004 delivers and applies each request and copies the resulting
  membership back to the cell. Its exclusion of first-password-change
  activation and Napsoft operations is covered here.
- M0001-03 owns password change; R012 adds membership activation to it.
- M0001-04 revokes sessions for R014 and R016.
- M0001-08 owns logins and memberships; R011 changes `ready` on the
  portal-access path, and R014–R016 add recovery routes beside its own.
- M0003 owns role assignments, read by R005. A new member has no role until
  one is assigned on the Roles screen.

## 12. Security And Audit

- Reset, unlock, disable, and re-enable each record an administrative event
  with actor, target login, and outcome, never the password or hash.
- Membership activation under R012 records one event per membership.
- Request events are I0004-R034's `portal_access.applied` and
  `portal_access.failed`.
- The directory change itself writes M0005-R025's event; it records the flag,
  never the temporary password.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                            | Requirements           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| AC01      | Turning access on for a new email creates a login; the person signs in with the temporary password, must change it, and can then select the tenant.        | I0008-R001, R011, R012 |
| AC02      | Turning access on without a primary email or temporary password fails and writes no request.                                                               | I0008-R003             |
| AC03      | Turning access off, or archiving the person, suspends the membership and revokes only that tenant's sessions; restoring leaves the flag off.               | I0008-R002             |
| AC04      | Turning off or archiving a `tenant_admin`, or oneself, fails and changes nothing.                                                                          | I0008-R005, R006       |
| AC05      | The status column moves through `requested`, `invited`, and `on`, and shows `failed` with the stated reason for a disabled login and a conflicting member. | I0008-R008, R009       |
| AC06      | An `invited` person shows the pending-invitation note; for a login invited by two tenants, its first password change activates both memberships.           | I0008-R010, R012       |
| AC07      | Retry on a failed person sends a new request; retry on any other status fails with `INVALID_STATE`.                                                        | I0008-R007             |
| AC08      | A Napsoft operator sees a login's memberships, resets its password without changing membership status, unlocks it, and disables and re-enables it.         | I0008-R013–R016        |
| AC09      | `support` gets `403` on the membership view and every recovery action; every recovery action on the bootstrap login returns `409 ROOT_IMMUTABLE`.          | I0008-R017, §4         |
| AC10      | No temporary password appears in the cell, the outbox, events, logs, or any response.                                                                      | I0008 §7, §12          |
| AC11      | While access is on, adding, editing, replacing, or archiving the person's primary email fails; after access is off, the change succeeds.                   | I0008-R018             |

## 14. Outstanding Questions

None.
