# M0001-08: Portal-User and Membership Administration

## 1. Document Control

| Field                | Value                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Status               | Draft                                                                                                                                      |
| Type                 | Module Work Unit                                                                                                                           |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                          |
| Related architecture | [Admin and cells](../../../architecture/admin-cells.md)                                                                                    |
| Related PRDs         | [M0001-03](M0001-03-authentication.md), [M0001-05](M0001-05-authorization.md), [M0001-09](M0001-09-tenant-selection-and-support-access.md) |
| Related decisions    | None                                                                                                                                       |
| Last reviewed        | 2026-09-20                                                                                                                                 |

## 2. Purpose

Administer ordinary portal users and tenant memberships and track requested
cell-side member provisioning.

## 3. Scope

### Included

- Create, read, update, disable, archive, and restore ordinary portal users.
- Create, read, suspend, reactivate, archive, and restore memberships.
- Queue, inspect, retry, and complete membership-provisioning jobs.

### Excluded

- Table definitions and migrations.
- Root-user changes.
- Cell-side employee, client, vendor, or vendor-contact creation.
- Self-service profile and password changes.

## 4. Actors And Permissions

| Actor                         | Target                                           | Result                                                                                  |
| ----------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Root or `platform_admin`      | Any ordinary user or membership                  | Permit matching accounts capability                                                     |
| `support`                     | Any ordinary user; non-Napsoft membership or job | Permit matching accounts capability                                                     |
| `support`                     | Napsoft membership or provisioning job           | Deny                                                                                    |
| `tenant_admin`                | Memberships and users within own tenant          | Read users and manage own-tenant memberships; cannot disable or archive shared accounts |
| Trusted provisioning workflow | Existing queued or running job                   | Report progress or result                                                               |

## 5. Concepts And Terminology

| Term               | Meaning                                                              |
| ------------------ | -------------------------------------------------------------------- |
| Shared account     | Portal user with memberships in more than one tenant                 |
| Temporary password | Operator-supplied password that must be replaced at next login       |
| Provisioning job   | Central request to create the membership's cell-side business record |

## 6. Functional Requirements

- M0001-08-R001: Authorized operations must create and maintain ordinary portal users without changing root records.
- M0001-08-R002: Authorized operations must create and maintain one active membership per portal-user/tenant pair.
- M0001-08-R003: Creating a membership must queue one provisioning job and expose its current result.
- M0001-08-R004: Central operations must commit without requiring a cell to be available.
- M0001-08-R005: A provisioning result must match its job, tenant, membership, and member type; failure must not mark the membership ready.

## 7. Business Rules And Invariants

- M0001-08-R006: Every operation must authorize the target tenant independently of user-supplied user, membership, job, or entity UUIDs.
- M0001-08-R007: Support may manage platform-level portal-user records but must not read or change Napsoft memberships or their provisioning jobs.

Support may manage the platform-level portal-user record. Responses to support
must omit the user's Napsoft memberships and related provisioning jobs.

Email is trimmed and lowercased and must be a valid address no longer than 254
characters. A new user requires a temporary password meeting WU 3 rules,
starts `active`, and has `must_change_password = true`. An existing active user
with the same email is reused when adding another membership.

Member type is `employee`, `client`, `vendor`, or `contact`. A `vendor` member
is a person working for a vendor, not the vendor business itself.

New membership and job states are `pending` and `queued`. Only one unarchived membership exists
per user and tenant; only one queued or running job exists per membership.

Disabling or archiving a user revokes all sessions. Suspending or archiving a
membership revokes sessions selecting its tenant and clears readiness. Restoring
a user returns it as `disabled`; restoring a membership returns it as `suspended`
with no readiness until explicitly reactivated and reprovisioned.

## 8. Lifecycle And State Transitions

| Record              | Action             | Result                                                |
| ------------------- | ------------------ | ----------------------------------------------------- |
| New user            | Create             | Active account requiring password change              |
| Active user         | Disable            | Disabled; all sessions revoked                        |
| Ordinary user       | Archive            | Archived; all sessions revoked                        |
| Archived user       | Restore            | Disabled account                                      |
| No membership       | Create             | Pending membership and queued job                     |
| Pending membership  | Successful job     | Active, ready, result entity stored                   |
| Pending membership  | Failed job         | Pending, not ready, failure recorded                  |
| Active membership   | Suspend or archive | Not eligible for selection; matching sessions revoked |
| Archived membership | Restore            | Suspended and not ready                               |

## 9. Data Requirements

This Work Unit uses `admin.portal_users`, `admin.portal_user_tenants`, and
`admin.provisioning_jobs`. M0001-00 defines their schema and constraints.

## 10. API Requirements

| Method and route                                              | Purpose                            |
| ------------------------------------------------------------- | ---------------------------------- |
| `POST /api/admin-tenancy/v1/accounts/users`                   | Create or reuse a user             |
| `GET /api/admin-tenancy/v1/accounts/users/:id`                | Read a safe user view              |
| `PATCH /api/admin-tenancy/v1/accounts/users/:id`              | Change email or account status     |
| `DELETE /api/admin-tenancy/v1/accounts/users/:id`             | Archive user; repeat returns `204` |
| `POST /api/admin-tenancy/v1/accounts/users/:id/restore`       | Restore as disabled                |
| `POST /api/admin-tenancy/v1/accounts/memberships`             | Create membership and queued job   |
| `PATCH /api/admin-tenancy/v1/accounts/memberships/:id`        | Suspend or reactivate membership   |
| `DELETE /api/admin-tenancy/v1/accounts/memberships/:id`       | Archive membership                 |
| `POST /api/admin-tenancy/v1/accounts/memberships/:id/restore` | Restore as suspended               |
| `GET /api/admin-tenancy/v1/accounts/jobs/:id`                 | Read safe provisioning status      |
| `POST /api/admin-tenancy/v1/accounts/jobs/:id/retry`          | Requeue a failed job               |

Create requests require an `Idempotency-Key` UUID. Repeats return the original
result; changed payloads return `409`. The provisioning workflow uses internal
transactional methods, not a public result route. Invalid input returns `400`,
unauthorized access `403`, missing records `404`, and invalid states `409`.

## 11. Cross-Module Interactions

The membership-provisioning workflow creates the appropriate cell-side record
and binding, then reports its UUID. No admin foreign key points into a cell.
WUs 4, 9, 11, and 12 apply session, access, cache, and event effects.

## 12. Security And Audit

Responses exclude password hashes and temporary passwords. Events record actor,
tenant, target UUID, action, and outcome. They never record credentials or cell
failure detail that contains secrets.

## 13. Acceptance Criteria

| Criterion | Required result                                                                              | Requirements                                |
| --------- | -------------------------------------------------------------------------------------------- | ------------------------------------------- |
| AC01      | Authorized account operations follow normalization, root protection, and lifecycle rules.    | M0001-08-R001                               |
| AC02      | Membership operations enforce tenant scope, one active pair, and the Napsoft support denial. | M0001-08-R002, M0001-08-R006, M0001-08-R007 |
| AC03      | Creation atomically records the membership and one queued job without a cell connection.     | M0001-08-R003, M0001-08-R004                |
| AC04      | Mismatched, repeated, stale, failed, and successful job results follow the stated contract.  | M0001-08-R005                               |
| AC05      | User and membership restrictions revoke affected sessions and never expose credentials.      | M0001-08-R001, M0001-08-R002                |

## 14. Outstanding Questions

None.
