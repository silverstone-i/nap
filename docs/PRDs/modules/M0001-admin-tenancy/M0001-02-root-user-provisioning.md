# M0001-02: Root-User Provisioning

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                          |
| Type                 | Module work unit                                                                                                                                                                                                                                                                                                                               |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                                                                                                                                                                                                              |
| Owner                | To be confirmed                                                                                                                                                                                                                                                                                                                                |
| Related architecture | [Migrations](../../../architecture/migrations.md)                                                                                                                                                                                                                                                                                              |
| Related PRDs         | [M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md), [M0001-03: Authentication](M0001-03-authentication.md), [M0001-05: Authorization](M0001-05-authorization.md), [M0001-11: Cache Consistency](M0001-11-cache-consistency.md), [M0001-12: Administrative Events](M0001-12-administrative-events.md) |
| Related decisions    | None recorded separately; unresolved decisions are in section 14                                                                                                                                                                                                                                                                               |
| Last reviewed        | 2026-09-18                                                                                                                                                                                                                                                                                                                                     |

## 2. Purpose

Create the Napsoft tenant, root portal user, and root membership safely and
repeatably so an operator can establish the initial NAP identity records.

## 3. Scope

### Included

- Operator bootstrap of the three central foundation records.
- Repeat execution, collision detection, and recovery after interruption.
- Secure handling of the initial root credential.

### Excluded

- Cell setup, assignment, projections, or business records.
- Ordinary tenant and portal-user administration.
- Defining system roles or treating a root membership as a platform-role assignment.

## 4. Actors And Permissions

| Context                       | Actor               | Required authority or state                                    | Result                                           |
| ----------------------------- | ------------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| Bootstrap                     | Deployment operator | Admin schema exists and operator can run the bootstrap command | Establish or verify the root records             |
| Repeat bootstrap              | Deployment operator | Same agreed bootstrap identities                               | Return the existing consistent records           |
| Conflicting existing identity | Deployment operator | Existing data disagrees with the bootstrap contract            | Report conflict without taking over the identity |
| Browser request               | Any portal user     | No bootstrap HTTP interface                                    | Deny this entry path                             |

“Root” identifies the initial portal user. Its effective platform authority is
determined by [M0001-05: Authorization](M0001-05-authorization.md), not by its display name or tenant membership.

## 5. Concepts And Terminology

| Term                 | Meaning                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| Napsoft tenant       | The initial central tenant created for platform operation                           |
| Root portal user     | The initial central operator identity                                               |
| Root membership      | The root user's membership in the Napsoft tenant                                    |
| Repeatable bootstrap | Running the same command again does not duplicate or silently replace those records |

## 6. Functional Requirements

- M0001-02-R001: Bootstrap must establish the Napsoft tenant, root portal user, and their central membership using the foundation repositories.
- M0001-02-R002: Bootstrap must run after admin migration and must not require a cell database.
- M0001-02-R003: Repeating bootstrap with the same identities must preserve the existing records and must not reset an existing password or duplicate membership.
- M0001-02-R004: Conflicting identities or inconsistent existing relationships must produce an actionable failure rather than silently adopting unrelated records.

## 7. Business Rules And Invariants

- M0001-02-R005: An interrupted or failed bootstrap must not report success for an incomplete root foundation; retry must establish one consistent result.

[M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md) owns keys and relationship constraints. The concurrency and recovery
mechanism is open in Q03. The migration strategy also requires platform capability
seeding; [M0001-05: Authorization](M0001-05-authorization.md) owns that capability contract. The bootstrap command coordinates
these operations without moving role definitions into this work unit.

## 8. Lifecycle And State Transitions

| Starting condition            | Action           | Required outcome                                           |
| ----------------------------- | ---------------- | ---------------------------------------------------------- |
| No root records               | Bootstrap        | Establish all three related records                        |
| Consistent root records       | Repeat bootstrap | Verify and preserve the records                            |
| Interrupted prior run         | Retry            | Recover according to Q03 or report the unresolved conflict |
| Existing conflicting identity | Bootstrap        | Fail without changing its ownership or credential          |

Re-enabling a disabled root identity and recovering a lost credential are not
implicit effects of rerunning bootstrap; their rules are open in Q04.

## 9. Data Requirements

| Table                       | Records used     | Required identity relationship      |
| --------------------------- | ---------------- | ----------------------------------- |
| `admin.tenants`             | Napsoft tenant   | The canonical bootstrap tenant      |
| `admin.portal_users`        | Root portal user | The canonical bootstrap person      |
| `admin.portal_user_tenants` | Root membership  | Root user references Napsoft tenant |

This unit adds no separate table. Canonical codes, login identifier, initial
states, and credential source remain open in Q01–Q02. Credential representation
comes from [M0001-03: Authentication](M0001-03-authentication.md); foundation retention comes from [M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md).

## 10. API Requirements

Use the architecture's operator command:

```sh
npm run db:bootstrap -- --env dev
```

The environment contract also permits `test` and `prod`.

Input consists of the environment and agreed bootstrap identity/credential
source. Output reports created, already established, or failed state without
secrets. Exact flags, output, exit codes, and handling of competing runs are
open in Q02–Q03. No HTTP route is introduced.

## 11. Cross-Module Interactions

- [M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md) supplies the schema and repositories.
- [M0001-03: Authentication](M0001-03-authentication.md) supplies the credential-storage and password-change contract.
- [M0001-05: Authorization](M0001-05-authorization.md) defines the system-role seeds and any initial platform assignment.

The operator command can coordinate these admin contracts. It has no unresolved
cell dependency.

## 12. Security And Audit

- M0001-02-R006: Bootstrap output, logs, and events must not contain the root password, credential verifier, or connection secrets.

[M0001-12: Administrative Events](M0001-12-administrative-events.md) defines the bootstrap event and attribution for an operator who has no
portal session yet. [M0001-11: Cache Consistency](M0001-11-cache-consistency.md) covers changes affecting existing cached identities.
Administrative recovery after installation remains open in Q04.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                        | Requirements                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC01      | A migrated admin-only database receives the Napsoft tenant, root user, and matching membership.                                                        | M0001-02-R001, M0001-02-R002                                                                                                                           |
| AC02      | A repeated run preserves identities, password, and membership count.                                                                                   | M0001-02-R003                                                                                                                                          |
| AC03      | A conflicting login or tenant identity causes an actionable failure without overwriting unrelated data.                                                | M0001-02-R004                                                                                                                                          |
| AC04      | Injected interruption and competing runs produce a consistent result or explicit failure, never false success.                                         | M0001-02-R005                                                                                                                                          |
| AC05      | Logs, command output, and events contain no credential or connection secrets.                                                                          | M0001-02-R006                                                                                                                                          |
| AC06      | Applicable source mutations invalidate their cached decisions and record the required catalogue events; failures follow the accepted shared contracts. | [M0001-11-R002](M0001-11-cache-consistency.md#6-functional-requirements), [M0001-12-R001](M0001-12-administrative-events.md#6-functional-requirements) |

## 14. Open Questions

| ID  | Decision required before acceptance                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------- |
| Q01 | What identifies the canonical Napsoft tenant and root user, and what initial states do they receive?                              |
| Q02 | How is the initial password supplied, and must the root user change it before ordinary access?                                    |
| Q03 | How are atomicity, partial-run recovery, concurrent execution, and command results defined?                                       |
| Q04 | What is allowed after installation, including disabled-root handling and credential recovery?                                     |
| Q05 | Which initial platform assignment is established by unit 5, and how does command success account for platform capability seeding? |
