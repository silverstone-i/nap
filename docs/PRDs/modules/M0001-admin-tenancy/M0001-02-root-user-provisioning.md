# M0001-02: Root-User Provisioning

## 1. Document Control

| Field                | Value                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                            |
| Type                 | Module Work Unit                                                                                                                 |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                |
| Related architecture | [Migrations](../../../architecture/migrations.md)                                                                                |
| Related PRDs         | [M0001-00](M0001-00-admin-database-foundation.md), [M0001-03](M0001-03-authentication.md), [M0001-05](M0001-05-authorization.md) |
| Related decisions    | None                                                                                                                             |
| Last reviewed        | 2026-09-18                                                                                                                       |

## 2. Purpose

Create the Napsoft tenant, root portal user, root membership, and initial
`platform_admin` assignment safely and repeatably.

## 3. Scope

### Included

- The `db:bootstrap` maintenance command.
- Atomic creation and verification of central tenant, root-user, and association records.
- Root-role assignment after the owning tenant’s roles have been seeded.
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

| Term           | Meaning                                                                                |
| -------------- | -------------------------------------------------------------------------------------- |
| Napsoft tenant | The single tenant with `is_napsoft = true`                                             |
| Root user      | The single portal user with `is_root = true`                                           |
| Repeatable     | The same configuration verifies existing records without duplicating or replacing them |

## 6. Functional Requirements

- M0001-02-R001: Bootstrap must establish the Napsoft tenant, root portal user, root membership, and `platform_admin` assignment.
- M0001-02-R002: The initial identity phase must run after admin migration without requiring a cell database. Finalizing the `platform_admin` assignment must wait for the owning tenant’s cell provisioning and role seeds.
- M0001-02-R003: A repeated run with the same configuration must preserve the existing password and records.
- M0001-02-R004: A conflicting tenant, email, root marker, membership, or role assignment must fail without adopting or overwriting the conflicting record.

## 7. Business Rules And Invariants

- M0001-02-R005: Each bootstrap phase must hold a transaction-scoped advisory lock and commit its central writes in one transaction. Cell provisioning and seeding are separate operations, not part of an Admin database transaction.

The owning tenant’s name and code come from environment configuration; neither
is hard-coded to Napsoft. Bootstrap sets `is_napsoft = true` and status
`active`. It starts without a cell assignment. The root user is active and must
change the supplied password. The root membership is active and is not tied to
a cell-side business record.

The root user and root membership cannot be archived, disabled, reassigned, or
deleted. Rerunning bootstrap never acts as password recovery.

## 8. Lifecycle And State Transitions

| Starting state                       | Action    | Result                                                                    |
| ------------------------------------ | --------- | ------------------------------------------------------------------------- |
| No root records                      | Bootstrap | Create the three central identity records; report role assignment pending |
| Matching root records, seeds pending | Bootstrap | Preserve identity records; report role assignment pending                 |
| Partial or conflicting records       | Bootstrap | Roll back and report `conflict`                                           |
| Concurrent bootstrap                 | Bootstrap | One run holds the lock; the next verifies its result                      |

Once cell provisioning has run both role seed scripts for the owning tenant,
rerunning bootstrap validates the seeded `platform_admin` role and creates or
verifies its `admin.platform_roles` assignment. It reports completion only when
that assignment exists; it must not invent a role UUID before seeding.

## 9. Data Requirements

This Work Unit writes records in `admin.tenants`, `admin.portal_users`,
`admin.portal_user_tenants`, and `admin.platform_roles`. M0001-00 defines them.

## 10. API Requirements

No HTTP route is introduced.

```sh
npm run db:bootstrap -- --env dev
```

`dev`, `test`, and `prod` are valid environments. The owning tenant’s name and
code come from environment variables. The root email and initial password come
from environment-specific secret configuration. Email is trimmed and lowercased. The command returns `pending_roles`, `created`, `existing`, or `conflict` and
uses a nonzero exit code for conflict or failure.

## 11. Cross-Module Interactions

M0001-03 hashes the initial password. Tenant provisioning runs M0001-05's
two seed scripts in the owning tenant's cell before bootstrap finalizes the
root assignment. Initial cell provisioning must be available through maintenance
credentials without requiring the not-yet-created platform-role assignment.

## 12. Security And Audit

- M0001-02-R006: Command output, logs, and events must not contain the initial password, password hash, or database credentials.

Bootstrap records one managed event with no session actor and a request ID
generated by the command. It records only the outcome and created record UUIDs.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                  | Requirements                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC01      | Initial bootstrap creates central identity records without a cell; after owning-tenant provisioning and both seeds, rerunning creates the assignment using the seeded role UUID. | M0001-02-R001, M0001-02-R002 |
| AC02      | Repeated and concurrent runs preserve identity records, role UUIDs, assignments, and passwords across both bootstrap phases.                                                     | M0001-02-R003, M0001-02-R005 |
| AC03      | Conflicting or partial records cause rollback and an actionable non-secret error.                                                                                                | M0001-02-R004, M0001-02-R005 |
| AC04      | Output, logs, and events contain no password, hash, or connection secret.                                                                                                        | M0001-02-R006                |

## 14. Outstanding Questions

None.
