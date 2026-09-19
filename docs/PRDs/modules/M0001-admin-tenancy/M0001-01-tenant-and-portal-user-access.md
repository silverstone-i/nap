# M0001-01: Tenant and Portal-User Access

## 1. Document Control

| Field                | Value                                                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                                                                                           |
| Type                 | Module Work Unit                                                                                                                                                                                      |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                                                                     |
| Related architecture | [Module design](../../../architecture/module-design.md)                                                                                                                                               |
| Related PRDs         | [M0001-00](M0001-00-admin-database-foundation.md), [M0001-03](M0001-03-authentication.md), [M0001-07](M0001-07-tenant-creation.md), [M0001-08](M0001-08-portal-user-and-membership-administration.md) |
| Related decisions    | None                                                                                                                                                                                                  |
| Last reviewed        | 2026-09-19                                                                                                                                                                                            |

## 2. Purpose

Provide scoped internal reads for tenants, portal users, and memberships.

## 3. Scope

### Included

- Record lookup and membership-list operations used by other admin Work Units.
- Explicit field selection for ordinary and credential-bearing reads.
- Consistent missing-record, validation, conflict, and database-error behavior.

### Excluded

- Tables, models, grants, setup, and migrations, owned by M0001-00.
- Public administration APIs, owned by WUs 7 and 8.
- Password verification, session handling, and authorization decisions.

## 4. Actors And Permissions

The application performs runtime reads as the `nap-app` PostgreSQL role defined
by M0001-00. The calling operation must authorize its target before using these
methods.

| Caller                   | Required authority                 | Result                                  |
| ------------------------ | ---------------------------------- | --------------------------------------- |
| Admin operation          | Authorization scope for its target | Read ordinary fields within that scope  |
| Authentication operation | Internal credential-read authority | Read the login fields and password hash |

These methods enforce the supplied scope and credential-read boundary. They do
not determine application roles, resolve capabilities, or infer access from a
supplied record ID. M0001-05 owns those authorization decisions.

## 5. Concepts And Terminology

| Term                | Meaning                                                             |
| ------------------- | ------------------------------------------------------------------- |
| Ordinary read       | A read that excludes password hashes and session credentials        |
| Credential read     | The authentication-only lookup that includes `password_hash`        |
| Authorization scope | The tenants and records already permitted for the calling operation |

## 6. Functional Requirements

- M0001-01-R002: Shared reads must use only the admin database and must not require a physical cell database.
- M0001-01-R003: Internal methods must find a tenant or portal user by UUID and list memberships by portal-user UUID or tenant UUID.

## 7. Business Rules And Invariants

- M0001-01-R005: Shared methods must return `null` for a missing single record, an empty array for a list with no matches, and must propagate validation, conflict, and database failures as distinct typed errors.

Ordinary methods never return archived records. Administration methods that
restore records use explicit `IncludingArchived` methods and require archive
management authority.

## 8. Lifecycle And State Transitions

This Work Unit does not change record state. It exposes active records to normal
operations and archived records only to authorized restore operations.

## 9. Data Requirements

This Work Unit uses `admin.tenants`, `admin.portal_users`, and
`admin.portal_user_tenants`. M0001-00 defines their schema and models.

## 10. API Requirements

No HTTP route is introduced.

| Internal operation        | Input                                            | Result                                   |
| ------------------------- | ------------------------------------------------ | ---------------------------------------- |
| `findTenant`              | Scope and tenant UUID                            | Safe tenant view or `null`               |
| `findPortalUser`          | Scope and portal-user UUID                       | Safe portal-user view or `null`          |
| `listMembershipsByUser`   | Scope, user UUID, cursor, limit                  | Page of safe membership views            |
| `listMembershipsByTenant` | Scope, tenant UUID, cursor, limit                | Page of safe membership views            |
| `findCredentialByEmail`   | Authentication-only context and normalized email | Login fields and password hash or `null` |

List limits default to 50 and cannot exceed 100. Cursors are opaque. Invalid
UUIDs and limits return `INVALID_INPUT`; an unauthorized scope returns
`FORBIDDEN`; storage failures return `INTERNAL_ERROR` without database detail.

## 11. Cross-Module Interactions

WUs 2, 3, 7, 8, and 9 use these methods. Cell projections may reference the
returned UUIDs but are not required for central reads.

## 12. Security And Audit

- M0001-01-R006: Ordinary reads must exclude password hashes and other authentication secrets; only `findCredentialByEmail` may return a password hash.

Reads do not create managed events. The originating write operation records its
own event and cache invalidation.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                               | Requirements  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------- |
| AC01      | Shared reads work with only the admin database.                                                                               | M0001-01-R002 |
| AC02      | UUID lookups and both membership lists return the permitted records and stable pagination.                                    | M0001-01-R003 |
| AC03      | Missing records, empty lists, invalid input, conflicts, authorization failures, and database failures remain distinguishable. | M0001-01-R005 |
| AC04      | Ordinary reads never return password hashes; credential lookup is unavailable outside authentication.                         | M0001-01-R006 |

### Verification Evidence

Local validation on 2026-09-19: `npm run lint`, `npm run format:check`,
`npm test` (129 tests across the workspace, including 59 new unit tests),
`npm run build`, `npm run licenses`, and `git diff --check` passed.

`npm run test:db` passed 27 tests against a disposable PostgreSQL 18 server,
including 13 access integration tests.
[Database tests](../../../../apps/api/tests/integration/admin-tenancy-access.test.js)
cover active, missing, and archived tenant and portal-user reads;
archive-authority denial; tenant-scoped and explicitly denied membership
filtering; portal-user authorization through active memberships; platform-level
portal-user reads; authentication-only credential reads; stable pagination;
and every read running under the `nap-app` role alone.

## 14. Outstanding Questions

None.
