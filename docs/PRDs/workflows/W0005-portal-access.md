# W0005: Portal Access

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Type                 | Workflow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Related architecture | [Admin and cells](../../architecture/admin-cells.md), [Module map](../../architecture/module-map.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Related PRDs         | [M0001-03](../modules/M0001-admin-tenancy/M0001-03-authentication.md), [M0001-04](../modules/M0001-admin-tenancy/M0001-04-session-management.md), [M0001-05](../modules/M0001-admin-tenancy/M0001-05-authorization.md), [M0001-07](../modules/M0001-admin-tenancy/M0001-07-tenant-creation.md), [M0001-08](../modules/M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md), [M0001-09](../modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md), `M0002: Cell Tenancy`, `M0005: Business Directory`, `W0003: Projection Synchronization` |
| Related decisions    | Portal access is driven from the tenant's user record; tenants cannot overwrite an unused temporary password                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Last reviewed        | 2026-09-23                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 2. Purpose

Let a tenant decide which of its people can sign in. A tenant turns portal
access on or off on its own user records; the workflow creates, reuses, and
suspends the central login and membership to match. Napsoft staff handle the
cases a tenant cannot: the first `tenant_admin`, shared logins, and recovery.

## 3. Scope

### Included

- Turning portal access on, off, and back on for a tenant user.
- Creating or reusing the central login and membership.
- Activating pending memberships on the first password change.
- Tenant suspension, archiving, and reinstatement effects on portal access.
- Napsoft operations on logins and tenants listed in §4.
- Delivery between the cell and admin databases, and status reported back to the tenant.

### Excluded

- User records themselves; `M0005: Business Directory` owns them and the `is_portal_user` flag.
- Password-link invitations by email; see §14.
- Role assignment for the new member; M0001-05 and `M0003: Access Control` own it.
- Support access to tenant data; M0001-09 and M0001-13 own it.

## 4. Actors And Permissions

| Context                                               | Actor                             | Required permission         | Required state                       | Result                                            |
| ----------------------------------------------------- | --------------------------------- | --------------------------- | ------------------------------------ | ------------------------------------------------- |
| Turn access on or off                                 | `tenant_admin`                    | Own tenant                  | Tenant active                        | Request queued for the user                       |
| Turn off own access or the last `tenant_admin`        | `tenant_admin`                    | Own tenant                  | Any                                  | Rejected                                          |
| Change a user's email                                 | `tenant_admin`                    | Own tenant                  | Login not shared with another tenant | Email updated centrally                           |
| Provision a `tenant_admin`                            | Root, `platform_admin`, `support` | New capability              | Tenant active or being reinstated    | Employee record, flag on, `tenant_admin` role     |
| Reset a password                                      | Root, `platform_admin`, `support` | New capability              | Login not root                       | Temporary password; `must_change_password = true` |
| Unlock a login                                        | Root, `platform_admin`, `support` | New capability              | Login `locked`                       | Login `active`                                    |
| Disable or re-enable a login everywhere               | Root, `platform_admin`, `support` | New capability              | Login not root                       | All sessions revoked on disable                   |
| Change a shared login's email                         | Root, `platform_admin`, `support` | New capability              | Any                                  | Email updated                                     |
| View a login's memberships across tenants             | Root, `platform_admin`, `support` | New capability              | Any                                  | Membership list                                   |
| Revoke a login's sessions                             | Root, `platform_admin`, `support` | Existing session capability | Any                                  | Sessions revoked; statuses unchanged              |
| Suspend, archive, or reinstate a tenant               | Root, `platform_admin`, `support` | New capability              | See §8                               | See §8                                            |
| Retry a failed request                                | Root, `platform_admin`, `support` | New capability              | Request `failed`                     | Request re-queued                                 |
| Any of the above on the Napsoft tenant or its members | `support`                         | Any                         | Any                                  | Denied without returning data                     |

## 5. Concepts And Terminology

| Term                  | Meaning                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| User                  | A tenant's employee, vendor contact, client, or contact record in the cell                        |
| Portal user           | The central login: email, password, and account status                                            |
| Membership            | The central link between one portal user and one tenant (`admin.portal_user_tenants`)             |
| Portal access flag    | `is_portal_user` on the user record; shown to the tenant as `off`, `requested`, `on`, or `failed` |
| Pending invitation    | A login with an unused temporary password (`must_change_password = true`)                         |
| Portal-access request | A queued instruction to make the central records match the flag                                   |

## 6. Functional Requirements

- W0005-R001: Turning access on for a user whose email has no login must create a login with the supplied temporary password and `must_change_password = true`, and a `pending` membership.
- W0005-R002: Turning access on for a login with no active membership must set the supplied temporary password and `must_change_password = true`, and create or reuse the membership as `pending`, unless R006 applies.
- W0005-R003: Turning access on for a login with at least one active membership must create or reuse the membership as `active` without changing the password.
- W0005-R004: The first password change of a login must move every `pending` membership of that login to `active`.
- W0005-R005: Turning access off, or archiving the user, must suspend the membership and revoke only the sessions that selected that tenant.
- W0005-R006: A tenant must not set a temporary password on a login that has a pending invitation; the request must still create or reuse the membership as `pending` and report that the person already has a pending invitation.
- W0005-R007: Turning access on must fail when the login is disabled centrally, and must report that support is required.
- W0005-R008: Suspending or archiving a tenant must turn every user's flag off, suspend every membership in that tenant, and revoke every session that selected it.
- W0005-R009: Reinstating a tenant must leave every flag off; Napsoft must provision a `tenant_admin` before tenant users can turn access back on.
- W0005-R010: A password reset by Napsoft must set a temporary password and `must_change_password = true` and must not change membership status.
- W0005-R011: The flag change and its portal-access request must commit together in the cell; the central change must be applied by a background worker and its result reported back to the flag.
- W0005-R012: Central status changes to a login, membership, or tenant must be reflected in the cell's membership copy and on the user's flag.
- W0005-R013: The Napsoft operations in §4 must be available to root, `platform_admin`, and `support`, with `support` denied any target in the Napsoft tenant.

## 7. Business Rules And Invariants

- A login's email is unique among unarchived logins; turning access on matches an existing login by email, case-insensitively.
- A `tenant_admin` can change a user's email only when that login has no membership in another tenant.
- A `tenant_admin` cannot turn off their own access or the access of the tenant's last active `tenant_admin`.
- The root user's login and membership cannot be changed through this workflow.
- Requests for the same user apply in order; a newer request supersedes an older queued one.
- The membership copy in the cell records `portal_user_id`, member type, and user record ID, and ignores updates older than the revision it holds.

## 8. Lifecycle And State Transitions

Portal access flag, as the tenant sees it:

| State       | Action                       | Result                      |
| ----------- | ---------------------------- | --------------------------- |
| `off`       | Turn on                      | `requested`                 |
| `requested` | Worker applies               | `on`                        |
| `requested` | Worker fails                 | `failed`                    |
| `failed`    | Retry                        | `requested`                 |
| `on`        | Turn off or archive user     | `off`; membership suspended |
| Any         | Tenant suspended or archived | `off`                       |

Membership:

| State                 | Action                                         | Result      |
| --------------------- | ---------------------------------------------- | ----------- |
| None                  | Access on, login has no active membership      | `pending`   |
| None or `suspended`   | Access on, login has an active membership      | `active`    |
| `suspended`           | Access on, login has no active membership      | `pending`   |
| `pending`             | Login's first password change                  | `active`    |
| `pending` or `active` | Access off, user archived, or tenant suspended | `suspended` |

Tenant:

| State       | Action             | Result                                                               |
| ----------- | ------------------ | -------------------------------------------------------------------- |
| `active`    | Suspend or archive | All flags `off`; memberships suspended                               |
| `suspended` | Reinstate          | `active`; flags stay `off` until Napsoft provisions a `tenant_admin` |

## 9. Data Requirements

Central data uses the existing `admin.portal_users` and
`admin.portal_user_tenants`; a pending invitation is `must_change_password = true`.
The flag, its displayed state, and the request outbox live in the cell; their
tables are an outstanding question (§14). `admin.provisioning_jobs` either
reverses direction or is replaced by the outbox.

## 10. API Requirements

| Method and route                                                           | Purpose                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Business Directory user update                                             | Set the portal access flag; returns the `requested` state                            |
| `POST /api/admin-tenancy/v1/accounts/users/:id/password-reset`             | Napsoft password reset                                                               |
| `POST /api/admin-tenancy/v1/accounts/users/:id/unlock`                     | Unlock a login                                                                       |
| `PATCH /api/admin-tenancy/v1/accounts/users/:id`                           | Disable, re-enable, or change email (existing route, Napsoft-only for shared logins) |
| `GET /api/admin-tenancy/v1/accounts/users/:id/memberships`                 | Cross-tenant membership view                                                         |
| `POST /api/admin-tenancy/v1/tenants/:id/suspend`, `/archive`, `/reinstate` | Tenant lifecycle                                                                     |
| `POST /api/admin-tenancy/v1/tenants/:id/tenant-admin`                      | Provision a `tenant_admin`                                                           |
| `POST /api/admin-tenancy/v1/portal-access/requests/:id/retry`              | Retry a failed request                                                               |

Exact route names are settled when the PRD is accepted.

## 11. Cross-Module Interactions

- `M0005: Business Directory` owns user records and the flag, and calls this workflow when the flag changes or a user is archived.
- `M0002: Cell Tenancy` holds the membership copy with `portal_user_id`, member type, and user record ID, and applies status changes from admin.
- `W0003: Projection Synchronization` delivers requests and results in both directions and owns retry.
- M0001-03, M0001-04, M0001-05, M0001-07, and M0001-08 are amended by this workflow; each records its amendment.

## 12. Security And Audit

Temporary passwords are never stored in the cell, the outbox, logs, or events.
Every request, result, reset, unlock, disable, and tenant lifecycle change
records an administrative event with the actor, tenant, target login, and outcome.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                            | Requirements                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| AC01      | Turning access on creates or reuses the login and membership with the correct status in each case.                         | W0005-R001, W0005-R002, W0005-R003 |
| AC02      | A first password change activates every pending membership of that login.                                                  | W0005-R004                         |
| AC03      | Turning access off or archiving a user suspends only that membership and its tenant's sessions.                            | W0005-R005                         |
| AC04      | A pending invitation's password is never overwritten by another tenant; a disabled login is never re-enabled by a tenant.  | W0005-R006, W0005-R007             |
| AC05      | Tenant suspension turns every flag off and revokes sessions; reinstatement waits for a Napsoft-provisioned `tenant_admin`. | W0005-R008, W0005-R009             |
| AC06      | A Napsoft password reset changes no membership status.                                                                     | W0005-R010                         |
| AC07      | A failed central apply leaves the flag `failed` and retry succeeds without duplicates; central changes reach the cell.     | W0005-R011, W0005-R012             |
| AC08      | Napsoft operations work for root, `platform_admin`, and `support`, and `support` is denied on the Napsoft tenant.          | W0005-R013                         |

## 14. Outstanding Questions

- The outbox and flag-state tables, and whether M0002 or W0003 owns them.
- How `is_portal_user` is modelled on each user type in M0005.
- The new capability identifiers for the Napsoft operations in §4.
- Later: replace tenant-set temporary passwords with a one-time set-password link once email delivery exists.
