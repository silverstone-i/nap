# NAP Development Roadmap

## Purpose

This roadmap is a checklist and planned sequence, not a fixed order. Work may
be reordered or split when that serves delivery. It records current progress
and verification evidence. It covers the modules, capabilities, inter-module workflows, and UI
defined by the current architecture.

Update this document when work starts, becomes blocked, or is verified as
complete. Do not mark an item complete because its code exists; record the
checks that prove its requirements and acceptance criteria pass.

## Status

Use one status for each roadmap item:

- `Not started`: no implementation work has begun.
- `In progress`: implementation or verification is underway.
- `Blocked`: work cannot continue until the recorded blocker is resolved.
- `Complete`: the accepted PRD is implemented and its acceptance criteria are
  verified.

## Delivery Rules

- Accept the relevant PRD before implementing its requirements.
- Implement one usable vertical slice at a time.
- Add UI in the same slice as the behavior it exposes.
- Keep data ownership in the module named by the module map.
- Keep cross-module sequencing in `application/` code.
- Record verification evidence before changing an item to `Complete`.
- Do not treat a roadmap number as a PRD number or release commitment.

## Incremental UI Strategy

The UI grows with the capabilities and modules it exposes. NAP will not build a
complete frontend before the underlying behavior, and it will not postpone all
UI work until the backend is complete.

The first UI milestone is:

```text
login -> restore session -> select tenant -> authorized application shell
```

Build the shell after the authentication and session contracts are accepted.
The shell includes application layout, navigation, loading and error states,
session expiry handling, and tenant context. Add role-aware navigation and
action visibility only after the RBAC decision model is accepted.

For each later PRD:

1. accept its PRD and API contract;
2. implement and verify the backend behavior;
3. add the smallest complete UI flow that exposes the behavior;
4. verify permissions, validation, empty states, errors, and the primary user
   journey;
5. record the evidence in this roadmap.

Put required UI behavior in the PRD's functional requirements and
acceptance criteria. Do not create a separate UI PRD for the same behavior.

Shared UI components should be extracted only after repeated use establishes a
common pattern.

## Implementation Order

### Phase 1: Control Plane And Application Entry

| Order | Deliverable                     | PRD                                      | UI increment                                                                      | Status      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----: | ------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | Admin tenancy                   | `M0001: Admin Tenancy`                   | None until authentication exposes operator and tenant entry                       | Complete    | [M0001-00](../PRDs/modules/M0001-admin-tenancy/M0001-00-admin-database-foundation.md#verification-evidence), [M0001-01](../PRDs/modules/M0001-admin-tenancy/M0001-01-tenant-and-portal-user-access.md#verification-evidence), [M0001-11](../PRDs/modules/M0001-admin-tenancy/M0001-11-cache-consistency.md#verification-evidence), [M0001-12](../PRDs/modules/M0001-admin-tenancy/M0001-12-administrative-events.md#verification-evidence), [M0001-04](../PRDs/modules/M0001-admin-tenancy/M0001-04-session-management.md#verification-evidence), [M0001-03](../PRDs/modules/M0001-admin-tenancy/M0001-03-authentication.md#verification-evidence), [M0001-02](../PRDs/modules/M0001-admin-tenancy/M0001-02-root-user-provisioning.md), [M0001-06](../PRDs/modules/M0001-admin-tenancy/M0001-06-cell-management.md#verification-evidence), [M0001-07](../PRDs/modules/M0001-admin-tenancy/M0001-07-tenant-creation.md#verification-evidence), [M0001-08](../PRDs/modules/M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md#verification-evidence), [M0001-09](../PRDs/modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md#verification-evidence), [M0001-10](../PRDs/modules/M0001-admin-tenancy/M0001-10-module-entitlements.md#verification-evidence), and [M0001-05](../PRDs/modules/M0001-admin-tenancy/M0001-05-authorization.md#verification-evidence) verified; role authorization moved to M0003 and I0005. RBAC changes shipped in #42 and #43; M0001-10 tenant-admin entitlement read and M0001-12-R004 event-reader scoping added and every Work Unit re-verified 2026-09-28. |
|     2 | Application entry and shell     | `I0001: Application Entry and Shell`     | Login, session restoration, tenant selection, and authorized shell                | Complete    | [Re-verified 2026-09-28](../PRDs/inter-module-workflows/I0001-application-entry-and-shell.md#verification-evidence) after the RBAC rewrite (#42)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
|     3 | Platform administration screens | `I0002: Platform Administration Screens` | Tenants, Cells, and Portal Users list screens in Tenant Management                | Complete    | [Re-verified 2026-09-28](../PRDs/inter-module-workflows/I0002-platform-administration-screens.md#verification-evidence) after the RBAC rewrite (#42)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
|     4 | Cell tenancy                    | `M0002: Cell Tenancy`                    | None; cell readiness and shell context is a separate future inter-module workflow | Complete    | [M0002-01](../PRDs/modules/M0002-cell-tenancy/M0002-01-cell-database-foundation.md#verification-evidence), [M0002-02](../PRDs/modules/M0002-cell-tenancy/M0002-02-physical-identity.md#verification-evidence)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|     6 | Cell provisioning               | `I0003: Cell Provisioning`               | Cell registration, progress, failure, retry, and disable actions                  | Complete    | [I0003](../PRDs/inter-module-workflows/I0003-cell-provisioning.md#14-implementation-notes) (#30); Napsoft seed added in #42                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
|     7 | Tenant provisioning             | `I0006: Tenant Provisioning`             | Tenant creation, progress, failure, and retry                                     | Complete    | [I0006](../PRDs/inter-module-workflows/I0006-tenant-provisioning.md#verification-evidence)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
|     8 | Projection synchronization      | `I0004: Admin-Cell Sync`                 | Synchronization state and actionable failures in both directions (cell ↔ admin)   | In progress | [I0004](../PRDs/inter-module-workflows/I0004-admin-cell-sync.md); sync delivery built; synchronization state screen deferred                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

I0001 owns the user-facing application-entry flow and references M0001-03,
M0001-04, and M0001-09 for their API contracts rather than redefining them.

Phase 1 is complete when an authorized operator can sign in, restore a session,
register a cell, create a tenant, monitor provisioning, select an available
tenant, and enter the application shell.

### Phase 2: Authorization

| Order | Deliverable                | PRD                          | UI increment                                                   | Status      | Evidence                                                                                                              |
| ----: | -------------------------- | ---------------------------- | -------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
|     9 | Tenant access-control data | `M0003: Access Control`      | Role, permission, assignment, and access-scope administration  | In progress | Implemented in #42; PRD accepted 2026-09-28; open: a customer `tenant_admin` cannot load the Roles screen user picker |
|    10 | RBAC decision model        | `I0005: RBAC Decision Model` | Permission-aware routes, navigation, actions, and denied state | In progress | Implemented in #42; PRD accepted 2026-09-28; open: the web app does not check entitlements (the server does)          |

Design these two PRDs together. The inter-module workflow defines authorization
decisions; the module defines the tenant-owned records used by those decisions.
Implement the data contract before the workflow relies on it for tenant authorization.

Phase 2 is complete when server-side authorization and UI visibility use the
same accepted decision model, while the server remains authoritative.

### Phase 3: Directory and Settings

| Order | Deliverable            | PRD                             | UI increment                                                                                                      | Status      | Evidence                                                                                                                                                                                                                                                                                                                                                                       |
| ----: | ---------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|    11 | Reference data         | `M0004: Reference Data`         | Reference-data lookup controls needed by setup forms                                                              | Complete    | Implemented in #46; PRD accepted 2026-09-28; unit, DB, and web tests pass in CI; password-change fix verified on the dev stack                                                                                                                                                                                                                                                 |
|    12 | Reference-data rollout | `I0007: Reference-Data Rollout` | Operator rollout status, failures, and retry when required                                                        | Complete    | PRD accepted 2026-09-29; API unit, web, and DB tests pass locally; on the dev stack a second cell with its seed removed showed Missing 1, the Cells screen rollout brought it back to current with version 1 recorded, and `db:seed:rollout` ran clean                                                                                                                         |
|    13 | Business directory     | `M0005: Business Directory`     | Employee, client, vendor, vendor contact, contact, and address management, with a portal access flag on each user | Complete    | Implemented in #48; PRD accepted 2026-09-29; unit, DB, and web tests pass locally and in CI; on a recreated dev stack a provisioned tenant's admin appeared as employee and primary contact, a client with buyers saved with a flagged primary tax contact, an SSN showed masked and revealed, the cell stored only ciphertext, and admin received masked `directory.*` events |
|    14 | Portal access          |                                 | Portal access on/off, request status, and Napsoft login recovery                                                  | Not started |                                                                                                                                                                                                                                                                                                                                                                                |
|    15 | Companies              |                                 | Legal-entity and tax-registration management                                                                      | Not started |                                                                                                                                                                                                                                                                                                                                                                                |
|    16 | Tenant settings        |                                 | Numbering, preference, payment-term, and approval configuration                                                   | Not started |                                                                                                                                                                                                                                                                                                                                                                                |

Phase 3 is complete when a tenant administrator can establish the organization,
people, counterparties, legal entities, and settings required by later modules.

### Phase 4: Reusable Operational Foundations

| Order | Deliverable | PRD | UI increment                                                 | Status      | Evidence |
| ----: | ----------- | --- | ------------------------------------------------------------ | ----------- | -------- |
|    17 | Catalog     |     | Products, materials, vendor SKUs, prices, and assemblies     | Not started |          |
|    18 | Cost codes  |     | Cost-category and activity management                        | Not started |          |
|    19 | Projects    |     | Project creation, structure, membership, and change tracking | Not started |          |

Phase 4 is complete when later commercial and delivery modules can use shared
catalog, cost, and project records through accepted contracts.

### Phase 5: Commercial Planning And Contracting

| Order | Deliverable | PRD | UI increment                                                       | Status      | Evidence |
| ----: | ----------- | --- | ------------------------------------------------------------------ | ----------- | -------- |
|    20 | Estimating  |     | Estimate templates, versions, cost inputs, bids, and approvals     | Not started |          |
|    21 | Sales       |     | Opportunities, quotes, buyer selections, and approvals             | Not started |          |
|    22 | Contracts   |     | Agreements, versions, amendments, changes, milestones, and history | Not started |          |

Phase 5 is complete when users can move work from estimating and sales through
an executed contract without bypassing accepted approval and version rules.

### Phase 6: Project Delivery And Cost Control

| Order | Deliverable   | PRD | UI increment                                                     | Status      | Evidence |
| ----: | ------------- | --- | ---------------------------------------------------------------- | ----------- | -------- |
|    23 | Scheduling    |     | Activities, dependencies, milestones, deliverables, and progress | Not started |          |
|    24 | Project costs |     | Baselines, approved changes, forecasts, rollups, and variances   | Not started |          |

Phase 6 is complete when project teams can plan work, record progress, and
compare approved costs with forecasts and actual outcomes.

### Phase 7: Finance

| Order | Deliverable         | PRD | UI increment                                                       | Status      | Evidence |
| ----: | ------------------- | --- | ------------------------------------------------------------------ | ----------- | -------- |
|    25 | Accounting          |     | Accounts, periods, journals, posting, balances, and intercompany   | Not started |          |
|    26 | Accounts payable    |     | Purchase orders, vendor invoices, approvals, payments, and credits | Not started |          |
|    27 | Accounts receivable |     | Customer invoices, receipts, allocations, and credits              | Not started |          |

Phase 7 is complete when payable and receivable activity posts through the
accepted accounting rules and can be reconciled to ledger balances.

### Phase 8: Reporting

| Order | Deliverable | PRD | UI increment                                         | Status      | Evidence |
| ----: | ----------- | --- | ---------------------------------------------------- | ----------- | -------- |
|    28 | Reporting   |     | Tenant-safe report selection, filtering, and display | Not started |          |

Phase 8 is complete when authorized users can view tenant-safe reports whose
figures reconcile to the owning modules.

## Progress Log

### PR Validation

When a PR changes roadmap progress, update the affected rows and list their
exact deliverable names in the PR description:

```markdown
## Roadmap

- Admin tenancy
```

The Roadmap Check requires a status or evidence change for each listed item.
New items marked `Complete`, transitions to `Complete`, and edits to completion
evidence require a nonempty Evidence cell. Record the acceptance checks and
their results, with links to test output, PRs, or release evidence when available.
CI checks that evidence is recorded; reviewers still verify that it proves the
accepted requirements, including the UI workflow.

For unrelated PRs, omit the section or write `None`. No roadmap update is
required, and the check passes. Changes to completion evidence are checked even
when the PR does not list roadmap items. The check does not infer scope from code
or change statuses automatically. Priorities and acceptance remain manual.

### Status Changes

Add one entry for each material status change. Link to the PRD, implementation
plan, pull request, test output, or release evidence when available.

| Date       | Item                            | Change                                                                                                            | Evidence                                                                                                                                                                  |
| ---------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-19 | Admin tenancy                   | M0001-00 implemented; family in progress                                                                          | [Foundation verification](../PRDs/modules/M0001-admin-tenancy/M0001-00-admin-database-foundation.md#verification-evidence)                                                |
| 2026-09-19 | Admin tenancy                   | M0001-01 implemented; family in progress                                                                          | [Tenant and portal-user access verification](../PRDs/modules/M0001-admin-tenancy/M0001-01-tenant-and-portal-user-access.md#verification-evidence)                         |
| 2026-09-19 | Admin tenancy                   | M0001-11 implemented; family in progress                                                                          | [Cache consistency verification](../PRDs/modules/M0001-admin-tenancy/M0001-11-cache-consistency.md#verification-evidence)                                                 |
| 2026-09-19 | Admin tenancy                   | M0001-12 implemented; family in progress                                                                          | [Administrative events verification](../PRDs/modules/M0001-admin-tenancy/M0001-12-administrative-events.md#verification-evidence)                                         |
| 2026-09-20 | Admin tenancy                   | M0001-04 implemented; family in progress                                                                          | [Session management verification](../PRDs/modules/M0001-admin-tenancy/M0001-04-session-management.md#verification-evidence)                                               |
| 2026-09-20 | Admin tenancy                   | M0001-03 implemented; family in progress                                                                          | [Authentication verification](../PRDs/modules/M0001-admin-tenancy/M0001-03-authentication.md#verification-evidence)                                                       |
| 2026-09-20 | Admin tenancy                   | M0001-02 implemented; family in progress                                                                          | [Napsoft bootstrap](../PRDs/modules/M0001-admin-tenancy/M0001-02-root-user-provisioning.md)                                                                               |
| 2026-09-20 | Admin tenancy                   | M0001-06 implemented; family in progress                                                                          | [Cell management verification](../PRDs/modules/M0001-admin-tenancy/M0001-06-cell-management.md#verification-evidence)                                                     |
| 2026-09-20 | Admin tenancy                   | M0001-07 implemented; family in progress                                                                          | [Tenant creation verification](../PRDs/modules/M0001-admin-tenancy/M0001-07-tenant-creation.md#verification-evidence)                                                     |
| 2026-09-21 | Admin tenancy                   | M0001-08 implemented; family in progress                                                                          | [Portal-user and membership administration verification](../PRDs/modules/M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md#verification-evidence) |
| 2026-09-21 | Admin tenancy                   | M0001-09 implemented; family in progress                                                                          | [Tenant selection and support access verification](../PRDs/modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md#verification-evidence)             |
| 2026-09-21 | Admin tenancy                   | M0001-10 implemented; family in progress                                                                          | [Module entitlements verification](../PRDs/modules/M0001-admin-tenancy/M0001-10-module-entitlements.md#verification-evidence)                                             |
| 2026-09-21 | Application entry and shell     | I0001 implemented; Phase 1 deliverable #2 complete                                                                | [Application entry and shell verification](../PRDs/inter-module-workflows/I0001-application-entry-and-shell.md#verification-evidence)                                     |
| 2026-09-21 | Application entry and shell     | Reopened for the Tenant Management navigation group                                                               | [I0001-R023](../PRDs/inter-module-workflows/I0001-application-entry-and-shell.md#6-functional-requirements)                                                               |
| 2026-09-21 | Application entry and shell     | I0001-R023 implemented; I0001 complete again                                                                      | [Application entry and shell verification](../PRDs/inter-module-workflows/I0001-application-entry-and-shell.md#verification-evidence)                                     |
| 2026-09-21 | Application entry and shell     | Reopened for I0001-R024, the `entryPoints.tenantManagement` signal                                                | [I0001-R024](../PRDs/inter-module-workflows/I0001-application-entry-and-shell.md#6-functional-requirements)                                                               |
| 2026-09-21 | Platform administration screens | I0002 drafted (Draft), covering Tenants/Cells/Portal Users list screens                                           | [I0002](../PRDs/inter-module-workflows/I0002-platform-administration-screens.md)                                                                                          |
| 2026-09-22 | Application entry and shell     | I0001-R024 implemented; I0001 complete again                                                                      | [Application entry and shell verification](../PRDs/inter-module-workflows/I0001-application-entry-and-shell.md#verification-evidence)                                     |
| 2026-09-22 | Platform administration screens | I0002 implemented; Phase 1 deliverable #3 complete                                                                | [Platform administration screens verification](../PRDs/inter-module-workflows/I0002-platform-administration-screens.md#verification-evidence)                             |
| 2026-09-23 | Admin tenancy                   | M0001-05 narrowed to root authority; family complete                                                              | [Authorization verification](../PRDs/modules/M0001-admin-tenancy/M0001-05-authorization.md#verification-evidence)                                                         |
| 2026-09-23 | Cell tenancy                    | M0002-01 implemented; family in progress                                                                          | [Cell database foundation verification](../PRDs/modules/M0002-cell-tenancy/M0002-01-cell-database-foundation.md#verification-evidence)                                    |
| 2026-09-24 | Cell tenancy                    | M0002-02 implemented; RLS removed from `cell` tables; later work moved to inter-module workflows; family complete | [Physical identity verification](../PRDs/modules/M0002-cell-tenancy/M0002-02-physical-identity.md#verification-evidence)                                                  |
| 2026-09-28 | Tenant provisioning             | I0006 implemented; Phase 1 deliverable #7 complete                                                                | [Tenant provisioning verification](../PRDs/inter-module-workflows/I0006-tenant-provisioning.md#verification-evidence)                                                     |
| 2026-09-29 | Reference-data rollout          | I0007 implemented and verified, including the Cells screen rollout on the dev stack                               | [Reference-data rollout notes](../PRDs/inter-module-workflows/I0007-reference-data-rollout.md#14-implementation-notes)                                                    |

## Current Blockers

None.
