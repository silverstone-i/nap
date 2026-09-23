# NAP Development Roadmap

## Purpose

This roadmap records NAP's implementation order, current progress, and
verification evidence. It covers the modules, capabilities, workflows, and UI
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
- Keep cross-module sequencing in workflow code.
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

For each later feature:

1. accept its PRD and API contract;
2. implement and verify the backend behavior;
3. add the smallest complete UI flow that exposes the behavior;
4. verify permissions, validation, empty states, errors, and the primary user
   journey;
5. record the evidence in this roadmap.

Put required UI behavior in the feature's functional requirements and
acceptance criteria. Do not create a separate UI PRD for the same behavior.

Shared UI components should be extracted only after repeated use establishes a
common pattern.

## Implementation Order

### Phase 1: Control Plane And Application Entry

| Order | Deliverable                     | PRD                                      | UI increment                                                                    | Status      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----: | ------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | Admin tenancy                   | `M0001: Admin Tenancy`                   | None until authentication exposes operator and tenant entry                     | In progress | [M0001-00](../PRDs/modules/M0001-admin-tenancy/M0001-00-admin-database-foundation.md#verification-evidence), [M0001-01](../PRDs/modules/M0001-admin-tenancy/M0001-01-tenant-and-portal-user-access.md#verification-evidence), [M0001-11](../PRDs/modules/M0001-admin-tenancy/M0001-11-cache-consistency.md#verification-evidence), [M0001-12](../PRDs/modules/M0001-admin-tenancy/M0001-12-administrative-events.md#verification-evidence), [M0001-04](../PRDs/modules/M0001-admin-tenancy/M0001-04-session-management.md#verification-evidence), [M0001-03](../PRDs/modules/M0001-admin-tenancy/M0001-03-authentication.md#verification-evidence), [M0001-02](../PRDs/modules/M0001-admin-tenancy/M0001-02-root-user-provisioning.md#verification-evidence), [M0001-06](../PRDs/modules/M0001-admin-tenancy/M0001-06-cell-management.md#verification-evidence), [M0001-07](../PRDs/modules/M0001-admin-tenancy/M0001-07-tenant-creation.md#verification-evidence), [M0001-08](../PRDs/modules/M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md#verification-evidence), [M0001-09](../PRDs/modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md#verification-evidence), and [M0001-10](../PRDs/modules/M0001-admin-tenancy/M0001-10-module-entitlements.md#verification-evidence) verified; only M0001-05 remains blocked. |
|     2 | Application entry and shell     | `F0001: Application Entry and Shell`     | Login, session restoration, tenant selection, and authorized shell              | Complete    | [F0001](../PRDs/features/F0001-application-entry-and-shell.md#verification-evidence) verified through F0001-R024, including the `entryPoints.tenantManagement` signal F0002 depends on.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
|     3 | Platform administration screens | `F0002: Platform Administration Screens` | Tenants, Cells, and Portal Users list screens in Tenant Management              | Complete    | [F0002](../PRDs/features/F0002-platform-administration-screens.md#verification-evidence) verified: all three screens, `GET /tenants`, and `GET /accounts/users` implemented and tested.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
|     4 | Cell tenancy                    | `M0002: Cell Tenancy`                    | Tenant and cell context shown where needed                                      | Not started |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|     5 | Cell provisioning               | `W0002: Cell Provisioning`               | Cell registration, progress, failure, retry, and disable actions                | Not started |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|     6 | Tenant provisioning             | `W0001: Tenant Provisioning`             | Tenant creation, progress, failure, and retry                                   | Not started |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|     7 | Projection synchronization      | `W0003: Projection Synchronization`      | Synchronization state and actionable failures in both directions (cell ↔ admin) | Not started |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

F0001 owns the user-facing application-entry flow and references M0001-03,
M0001-04, and M0001-09 for their API contracts rather than redefining them.

Phase 1 is complete when an authorized operator can sign in, restore a session,
register a cell, create a tenant, monitor provisioning, select an available
tenant, and enter the application shell.

### Phase 2: Authorization

| Order | Deliverable                | PRD                     | UI increment                                                   | Status      | Evidence                                                                                                                                   |
| ----: | -------------------------- | ----------------------- | -------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
|     9 | Tenant access-control data | `M0003: Access Control` | Role, permission, assignment, and access-scope administration  | Blocked     | [M0003-00](../PRDs/modules/M0003-access-control/M0003-00-role-catalogue-foundation.md) requires supported cell provisioning and migration. |
|    10 | RBAC decision model        | `F0003: RBAC`           | Permission-aware routes, navigation, actions, and denied state | Not started |                                                                                                                                            |

Design these two PRDs together. The feature defines authorization decisions;
the module defines the tenant-owned records used by those decisions. Implement
the data contract before the feature relies on it for tenant authorization.

Phase 2 is complete when server-side authorization and UI visibility use the
same accepted decision model, while the server remains authoritative.

### Phase 3: Organization Setup

| Order | Deliverable            | PRD                             | UI increment                                                                                                      | Status      | Evidence |
| ----: | ---------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------- | -------- |
|    11 | Reference data         | `M0004: Reference Data`         | Reference-data lookup controls needed by setup forms                                                              | Not started |          |
|    12 | Reference-data rollout | `W0004: Reference Data Rollout` | Operator rollout status, failures, and retry when required                                                        | Not started |          |
|    13 | Business directory     | `M0005: Business Directory`     | Employee, client, vendor, vendor contact, contact, and address management, with a portal access flag on each user | Not started |          |
|    14 | Portal access          | `W0005: Portal Access`          | Portal access on/off, request status, and Napsoft login recovery                                                  | Not started |          |
|    15 | Companies              | `M0006: Companies`              | Legal-entity and tax-registration management                                                                      | Not started |          |
|    16 | Tenant settings        | `M0007: Tenant Settings`        | Numbering, preference, payment-term, and approval configuration                                                   | Not started |          |

Phase 3 is complete when a tenant administrator can establish the organization,
people, counterparties, legal entities, and settings required by later modules.

### Phase 4: Reusable Operational Foundations

| Order | Deliverable | PRD                 | UI increment                                                 | Status      | Evidence |
| ----: | ----------- | ------------------- | ------------------------------------------------------------ | ----------- | -------- |
|    17 | Catalog     | `M0008: Catalog`    | Products, materials, vendor SKUs, prices, and assemblies     | Not started |          |
|    18 | Cost codes  | `M0009: Cost Codes` | Cost-category and activity management                        | Not started |          |
|    19 | Projects    | `M0010: Projects`   | Project creation, structure, membership, and change tracking | Not started |          |

Phase 4 is complete when later commercial and delivery modules can use shared
catalog, cost, and project records through accepted contracts.

### Phase 5: Commercial Planning And Contracting

| Order | Deliverable | PRD                 | UI increment                                                       | Status      | Evidence |
| ----: | ----------- | ------------------- | ------------------------------------------------------------------ | ----------- | -------- |
|    20 | Estimating  | `M0011: Estimating` | Estimate templates, versions, cost inputs, bids, and approvals     | Not started |          |
|    21 | Sales       | `M0012: Sales`      | Opportunities, quotes, buyer selections, and approvals             | Not started |          |
|    22 | Contracts   | `M0013: Contracts`  | Agreements, versions, amendments, changes, milestones, and history | Not started |          |

Phase 5 is complete when users can move work from estimating and sales through
an executed contract without bypassing accepted approval and version rules.

### Phase 6: Project Delivery And Cost Control

| Order | Deliverable   | PRD                    | UI increment                                                     | Status      | Evidence |
| ----: | ------------- | ---------------------- | ---------------------------------------------------------------- | ----------- | -------- |
|    23 | Scheduling    | `M0014: Scheduling`    | Activities, dependencies, milestones, deliverables, and progress | Not started |          |
|    24 | Project costs | `M0015: Project Costs` | Baselines, approved changes, forecasts, rollups, and variances   | Not started |          |

Phase 6 is complete when project teams can plan work, record progress, and
compare approved costs with forecasts and actual outcomes.

### Phase 7: Finance

| Order | Deliverable         | PRD                          | UI increment                                                       | Status      | Evidence |
| ----: | ------------------- | ---------------------------- | ------------------------------------------------------------------ | ----------- | -------- |
|    25 | Accounting          | `M0016: Accounting`          | Accounts, periods, journals, posting, balances, and intercompany   | Not started |          |
|    26 | Accounts payable    | `M0017: Accounts Payable`    | Purchase orders, vendor invoices, approvals, payments, and credits | Not started |          |
|    27 | Accounts receivable | `M0018: Accounts Receivable` | Customer invoices, receipts, allocations, and credits              | Not started |          |

Phase 7 is complete when payable and receivable activity posts through the
accepted accounting rules and can be reconciled to ledger balances.

### Phase 8: Reporting

| Order | Deliverable | PRD                | UI increment                                         | Status      | Evidence |
| ----: | ----------- | ------------------ | ---------------------------------------------------- | ----------- | -------- |
|    28 | Reporting   | `M0019: Reporting` | Tenant-safe report selection, filtering, and display | Not started |          |

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

| Date       | Item                            | Change                                                                  | Evidence                                                                                                                                                                  |
| ---------- | ------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-19 | Admin tenancy                   | M0001-00 implemented; family in progress                                | [Foundation verification](../PRDs/modules/M0001-admin-tenancy/M0001-00-admin-database-foundation.md#verification-evidence)                                                |
| 2026-09-19 | Admin tenancy                   | M0001-01 implemented; family in progress                                | [Tenant and portal-user access verification](../PRDs/modules/M0001-admin-tenancy/M0001-01-tenant-and-portal-user-access.md#verification-evidence)                         |
| 2026-09-19 | Admin tenancy                   | M0001-11 implemented; family in progress                                | [Cache consistency verification](../PRDs/modules/M0001-admin-tenancy/M0001-11-cache-consistency.md#verification-evidence)                                                 |
| 2026-09-19 | Admin tenancy                   | M0001-12 implemented; family in progress                                | [Administrative events verification](../PRDs/modules/M0001-admin-tenancy/M0001-12-administrative-events.md#verification-evidence)                                         |
| 2026-09-20 | Admin tenancy                   | M0001-04 implemented; family in progress                                | [Session management verification](../PRDs/modules/M0001-admin-tenancy/M0001-04-session-management.md#verification-evidence)                                               |
| 2026-09-20 | Admin tenancy                   | M0001-03 implemented; family in progress                                | [Authentication verification](../PRDs/modules/M0001-admin-tenancy/M0001-03-authentication.md#verification-evidence)                                                       |
| 2026-09-20 | Admin tenancy                   | M0001-02 implemented; family in progress                                | [Root-user provisioning verification](../PRDs/modules/M0001-admin-tenancy/M0001-02-root-user-provisioning.md#verification-evidence)                                       |
| 2026-09-20 | Admin tenancy                   | M0001-06 implemented; family in progress                                | [Cell management verification](../PRDs/modules/M0001-admin-tenancy/M0001-06-cell-management.md#verification-evidence)                                                     |
| 2026-09-20 | Admin tenancy                   | M0001-07 implemented; family in progress                                | [Tenant creation verification](../PRDs/modules/M0001-admin-tenancy/M0001-07-tenant-creation.md#verification-evidence)                                                     |
| 2026-09-21 | Admin tenancy                   | M0001-08 implemented; family in progress                                | [Portal-user and membership administration verification](../PRDs/modules/M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md#verification-evidence) |
| 2026-09-21 | Admin tenancy                   | M0001-09 implemented; family in progress                                | [Tenant selection and support access verification](../PRDs/modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md#verification-evidence)             |
| 2026-09-21 | Admin tenancy                   | M0001-10 implemented; family in progress                                | [Module entitlements verification](../PRDs/modules/M0001-admin-tenancy/M0001-10-module-entitlements.md#verification-evidence)                                             |
| 2026-09-21 | Application entry and shell     | F0001 implemented; Phase 1 deliverable #2 complete                      | [Application entry and shell verification](../PRDs/features/F0001-application-entry-and-shell.md#verification-evidence)                                                   |
| 2026-09-21 | Application entry and shell     | Reopened for the Tenant Management navigation group                     | [F0001-R023](../PRDs/features/F0001-application-entry-and-shell.md#6-functional-requirements)                                                                             |
| 2026-09-21 | Application entry and shell     | F0001-R023 implemented; F0001 complete again                            | [Application entry and shell verification](../PRDs/features/F0001-application-entry-and-shell.md#verification-evidence)                                                   |
| 2026-09-21 | Application entry and shell     | Reopened for F0001-R024, the `entryPoints.tenantManagement` signal      | [F0001-R024](../PRDs/features/F0001-application-entry-and-shell.md#6-functional-requirements)                                                                             |
| 2026-09-21 | Platform administration screens | F0002 drafted (Draft), covering Tenants/Cells/Portal Users list screens | [F0002](../PRDs/features/F0002-platform-administration-screens.md)                                                                                                        |
| 2026-09-22 | Application entry and shell     | F0001-R024 implemented; F0001 complete again                            | [Application entry and shell verification](../PRDs/features/F0001-application-entry-and-shell.md#verification-evidence)                                                   |
| 2026-09-22 | Platform administration screens | F0002 implemented; Phase 1 deliverable #3 complete                      | [Platform administration screens verification](../PRDs/features/F0002-platform-administration-screens.md#verification-evidence)                                           |

## Current Blockers

- M0001-05 role seeds, assignments, and non-root authorization require a
  supported cell provisioning and migration path.
- M0003-00 starts after that cell path is available.
