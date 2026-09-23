# M0001-02: Root-User Provisioning

## 1. Document Control

| Field                | Value                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                      |
| Type                 | Module Work Unit                                                                                                                 |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                |
| Related architecture | [Migrations](../../../architecture/migrations.md)                                                                                |
| Related PRDs         | [M0001-00](M0001-00-admin-database-foundation.md), [M0001-03](M0001-03-authentication.md), [M0001-05](M0001-05-authorization.md) |
| Related decisions    | None                                                                                                                             |
| Last reviewed        | 2026-09-20                                                                                                                       |

## 2. Purpose

Create the Napsoft tenant, root portal user, and root membership safely and
repeatably. Software grants the root user `platform_admin` capabilities as a
special case based on `is_root`; bootstrap does not create a role assignment.

## 3. Scope

### Included

- The `db:bootstrap` maintenance command.
- Atomic creation and verification of central tenant, root-user, and association records.
- Root authority derived from the portal user’s `is_root` flag.
- Safe retries and concurrent execution.

### Excluded

- Database schema creation and migration.
- Ordinary tenant, account, membership, and role administration.
- Root credential recovery after installation.

## 4. Actors And Permissions

| Actor               | Prerequisite                                        | Result                            |
| ------------------- | --------------------------------------------------- | --------------------------------- |
| Deployment operator | Migrated admin database and bootstrap configuration | Create or verify the root records |
| Browser caller      | None                                                | No bootstrap access               |

## 5. Concepts And Terminology

| Term           | Meaning                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Napsoft tenant | The single tenant with `is_napsoft = true`                                                                                      |
| Root user      | The single portal user with `is_root = true`; software grants this user `platform_admin` capabilities without a role assignment |
| Repeatable     | The same configuration verifies existing records without duplicating or replacing them                                          |

## 6. Functional Requirements

- M0001-02-R001: Bootstrap must establish the Napsoft tenant, root portal user with `is_root = true`, and root membership without creating a role assignment.
- M0001-02-R002: Bootstrap must run after admin migration without requiring a cell database or seeded cell roles.
- M0001-02-R003: A repeated run with the same configuration must preserve the existing password and records.
- M0001-02-R004: A conflicting tenant, email, root marker, or membership must fail without adopting or overwriting the conflicting record.

## 7. Business Rules And Invariants

- M0001-02-R005: Each bootstrap phase must hold a transaction-scoped advisory lock and commit its central writes in one transaction. Cell provisioning and seeding are separate operations, not part of an Admin database transaction.

The owning tenant’s name and code come from environment configuration; neither
is hard-coded to Napsoft. Bootstrap sets `is_napsoft = true` and status
`active`. It starts without a cell assignment. The root user is active and
does not require a password change on first login: `is_root = true` alone
grants `platform_admin` capabilities, so there is no restricted session for a
forced change to clear. The root membership is active and is not tied to
a cell-side business record.

The owning tenant may receive its first cell assignment after bootstrap while
`cell_id` is null, despite being active and having the root membership. Once
assigned, it cannot be reassigned because that membership exists.

The root user and root membership cannot be archived, disabled, reassigned, or
deleted. Rerunning bootstrap never acts as password recovery.

## 8. Lifecycle And State Transitions

| Starting state                 | Action    | Result                                                                                        |
| ------------------------------ | --------- | --------------------------------------------------------------------------------------------- |
| No root records                | Bootstrap | Create the three central identity records; root authority follows authentication restrictions |
| Matching root records          | Bootstrap | Preserve the identity records                                                                 |
| Partial or conflicting records | Bootstrap | Roll back and report `conflict`                                                               |
| Concurrent bootstrap           | Bootstrap | One run holds the lock; the next verifies its result                                          |

Root authority does not depend on cell provisioning, role seeding, or an
`admin.platform_roles` record. Authorization recognizes `is_root = true` and
grants the same capabilities as `platform_admin`.

## 9. Data Requirements

This Work Unit writes records in `admin.tenants`, `admin.portal_users`,
and `admin.portal_user_tenants`. M0001-00 defines them.

## 10. API Requirements

No HTTP route is introduced.

```sh
npm run db:bootstrap -- --env dev
```

`dev`, `test`, and `prod` are valid environments. The owning tenant’s name and
code come from environment variables. The root email and initial password come
from environment-specific secret configuration. Email is trimmed and lowercased.
The command returns `created`, `existing`, or `conflict` and uses a nonzero exit
code for conflict or failure.

## 11. Cross-Module Interactions

M0001-03 hashes the initial password. M0001-05-R001 defines the
`platform_admin` capability set that software grants to the root user based on
`is_root`.
Initial cell provisioning must be available through maintenance credentials
without requiring a platform-role assignment.

## 12. Security And Audit

- M0001-02-R006: Command output, logs, and events must not contain the initial password, password hash, or database credentials.

Bootstrap records one managed event with no session actor and a request ID
generated by the command. It records only the outcome and created record UUIDs.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                       | Requirements                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | Initial bootstrap creates the three central identity records, including `is_root = true`, without a cell or platform-role assignment. | M0001-02-R001, M0001-02-R002 |
| AC02      | Repeated and concurrent runs preserve identity records and passwords.                                                                 | M0001-02-R003, M0001-02-R005 |
| AC03      | Conflicting or partial records cause rollback and an actionable non-secret error.                                                     | M0001-02-R004, M0001-02-R005 |
| AC04      | Output, logs, and events contain no password, hash, or connection secret.                                                             | M0001-02-R006                |

### Verification Evidence

Local validation on 2026-09-20: `npm run lint`, `npm run format:check`,
`npm test` (303 tests across the workspace, including 6 new unit tests),
`npm run build`, and `npm run licenses` passed.

`npm run test:db` passed all 92 tests against a disposable PostgreSQL 18
server configured with real `scram-sha-256` password authentication for
`nap-admin` and `nap-app`, including all 7 new
[root-provisioning tests](../../../../apps/api/tests/integration/root-provisioning.test.js).

Integration tests cover a fresh bootstrap creating the tenant, root user
(`must_change_password = false`, no `admin.platform_roles` row), and root
membership, and recording exactly one `bootstrap.succeeded` event; a repeat
run preserving the password hash and every UUID; a tenant-code conflict and
a root-email conflict each rolling back before any row is written; the
existing owning tenant or root user differing from the configured identity
each reporting `conflict`; and two concurrent bootstrap calls serializing on
the advisory lock and agreeing on the created identity. Unit tests cover the
`MEMBERSHIP_CONFLICT` branch the `protect_membership` trigger otherwise makes
unreachable, and the `bootstrapSecrets`/`productionAdminConnection`
configuration parsing for dev, test, and prod.

The `db:bootstrap` command was also run twice end to end against a migrated
database outside the test suite: both runs returned identical UUIDs, the
stored hash was a real Argon2id digest, and `admin.managed_events` held only
`{}` details with no actor or session — confirming M0001-02-R006 outside the
test harness as well.

## 14. Outstanding Questions

None.
