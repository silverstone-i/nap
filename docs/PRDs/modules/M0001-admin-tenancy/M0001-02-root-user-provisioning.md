# M0001-02: Napsoft Bootstrap

## 1. Document Control

| Field                | Value                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Accepted                                                                                                                                       |
| Type                 | Module Work Unit                                                                                                                               |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                              |
| Related architecture | [Migrations](../../../architecture/migrations.md)                                                                                              |
| Related PRDs         | [M0001-00](M0001-00-admin-database-foundation.md), [M0001-03](M0001-03-authentication.md), [M0003: Access Control](../M0003-access-control.md) |
| Related decisions    | None                                                                                                                                           |
| Last reviewed        | 2026-09-27                                                                                                                                     |

## 2. Purpose

Create the Napsoft tenant, its first portal login, and that login's Napsoft
membership safely and repeatably. Seeding the Napsoft cell (M0003) assigns that
user `platform_admin`.

## 3. Scope

### Included

- The `db:bootstrap` maintenance command.
- Atomic creation and verification of the central tenant, portal-user, and membership records.
- Safe retries and concurrent execution.

### Excluded

- Database schema creation and migration.
- Roles and role assignments, which M0003 seeds in the Napsoft cell.
- Ordinary tenant, account, and membership administration.
- Credential recovery after installation.

## 4. Actors And Permissions

| Actor               | Prerequisite                                        | Result                                 |
| ------------------- | --------------------------------------------------- | -------------------------------------- |
| Deployment operator | Migrated admin database and bootstrap configuration | Create or verify the bootstrap records |
| Browser caller      | None                                                | No bootstrap access                    |

## 5. Concepts And Terminology

| Term            | Meaning                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------- |
| Napsoft tenant  | The single tenant with `is_napsoft = true`; its code comes from `ROOT_TENANT_CODE_<ENV>`  |
| Bootstrap login | The first Napsoft portal user, configured by `ROOT_EMAIL_<ENV>` and `ROOT_PASSWORD_<ENV>` |
| Repeatable      | The same configuration verifies existing records without duplicating or replacing them    |

## 6. Functional Requirements

- M0001-02-R001: Bootstrap must establish the Napsoft tenant, the bootstrap login, and its Napsoft membership. It creates no role or role assignment.
- M0001-02-R002: Bootstrap must run after admin migration without requiring a cell database or seeded cell roles.
- M0001-02-R003: A repeated run with the same configuration must preserve the existing password and records.
- M0001-02-R004: A conflicting tenant, email, or membership must fail without adopting or overwriting the conflicting record.

## 7. Business Rules And Invariants

- M0001-02-R005: Each bootstrap phase must hold a transaction-scoped advisory lock and commit its central writes in one transaction. Cell provisioning and seeding are separate operations, not part of an Admin database transaction.

The Napsoft tenant's name and code come from environment configuration
(`ROOT_COMPANY_<ENV>`, `ROOT_TENANT_CODE_<ENV>`); neither is hard-coded.
Bootstrap sets `is_napsoft = true` and status `active`. It starts without a
cell assignment. The bootstrap login is active and does not require a password
change on first login. Its membership is active and is not tied to a cell-side
business record.

The Napsoft tenant may receive its first cell assignment after bootstrap while
`cell_id` is null, despite being active and having a membership. Once
assigned, it cannot be reassigned because that membership exists.

Seeding the Napsoft cell assigns the bootstrap login `platform_admin` in that
cell. Until then the login authenticates but holds no capabilities. Rerunning
bootstrap never acts as password recovery.

## 8. Lifecycle And State Transitions

| Starting state                 | Action    | Result                                               |
| ------------------------------ | --------- | ---------------------------------------------------- |
| No bootstrap records           | Bootstrap | Create the three central records                     |
| Matching bootstrap records     | Bootstrap | Preserve the records                                 |
| Partial or conflicting records | Bootstrap | Roll back and report `conflict`                      |
| Concurrent bootstrap           | Bootstrap | One run holds the lock; the next verifies its result |

## 9. Data Requirements

This Work Unit writes records in `admin.tenants`, `admin.portal_users`,
and `admin.portal_user_tenants`. M0001-00 defines them.

## 10. API Requirements

No HTTP route is introduced.

```sh
npm run db:bootstrap -- --env dev
```

`dev`, `test`, and `prod` are valid environments. The Napsoft tenant's name and
code come from environment variables. The bootstrap email and initial password
come from environment-specific secret configuration. Email is trimmed and
lowercased. The command returns `created`, `existing`, or `conflict` and uses a
nonzero exit code for conflict or failure.

## 11. Cross-Module Interactions

M0001-03 hashes the initial password. M0003 seeds the Napsoft cell with
`platform_admin`, `support`, and `tenant_admin` and assigns the bootstrap login
`platform_admin`. The `db:provision:napsoft` maintenance command (I0003-R042) provisions the
Napsoft cell without requiring a role.

## 12. Security And Audit

- M0001-02-R006: Command output, logs, and events must not contain the initial password, password hash, or database credentials.

Bootstrap records one managed event with no session actor and a request ID
generated by the command. It records only the outcome and created record UUIDs.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                   | Requirements                 |
| --------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | Initial bootstrap creates the Napsoft tenant, bootstrap login, and membership, without a cell or any role record. | M0001-02-R001, M0001-02-R002 |
| AC02      | Repeated and concurrent runs preserve the records and passwords.                                                  | M0001-02-R003, M0001-02-R005 |
| AC03      | Conflicting or partial records cause rollback and an actionable non-secret error.                                 | M0001-02-R004, M0001-02-R005 |
| AC04      | Output, logs, and events contain no password, hash, or connection secret.                                         | M0001-02-R006                |

## 14. Outstanding Questions

None.
