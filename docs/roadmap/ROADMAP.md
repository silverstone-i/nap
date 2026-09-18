# NAP Development Roadmap

## Purpose

This roadmap records NAP's implementation order, current progress, and
verification evidence. It covers the modules, features, workflows, and UI
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

The UI grows with the features and modules it exposes. NAP will not build a
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

| Order | Deliverable                             | PRD                                 | UI increment                                                     | Status      | Evidence |
| ----: | --------------------------------------- | ----------------------------------- | ---------------------------------------------------------------- | ----------- | -------- |
|     1 | Admin tenancy                           | `M0001: Admin Tenancy`              | None until authentication exposes operator and tenant entry      | Not started |          |
|     2 | Authentication                          | `C0001: Authentication`             | Login, authentication errors, and signed-out state               | Not started |          |
|     3 | Session management and tenant selection | `C0002: Session Management`         | Session restoration, logout, expiry, and tenant selection        | Not started |          |
|     4 | Application shell                       | Covered by `C0001`–`C0002`          | Layout, tenant context, navigation, loading, and error states    | Not started |          |
|     5 | Cell tenancy                            | `M0002: Cell Tenancy`               | Tenant and cell context shown where needed                       | Not started |          |
|     6 | Cell provisioning                       | `W0002: Cell Provisioning`          | Cell registration, progress, failure, retry, and disable actions | Not started |          |
|     7 | Tenant provisioning                     | `W0001: Tenant Provisioning`        | Tenant creation, progress, failure, and retry                    | Not started |          |
|     8 | Projection synchronization              | `W0003: Projection Synchronization` | Synchronization state and actionable failures                    | Not started |          |

Phase 1 is complete when an authorized operator can sign in, restore a session,
register a cell, create a tenant, monitor provisioning, select an available
tenant, and enter the application shell.

### Phase 2: Authorization

| Order | Deliverable                | PRD                     | UI increment                                                   | Status      | Evidence |
| ----: | -------------------------- | ----------------------- | -------------------------------------------------------------- | ----------- | -------- |
|     9 | Tenant access-control data | `M0003: Access Control` | Role, permission, assignment, and access-scope administration  | Not started |          |
|    10 | RBAC decision model        | `C0003: RBAC`           | Permission-aware routes, navigation, actions, and denied state | Not started |          |

Design these two PRDs together. The feature defines authorization decisions;
the module defines the tenant-owned records used by those decisions. Implement
the data contract before the feature relies on it for tenant authorization.

Phase 2 is complete when server-side authorization and UI visibility use the
same accepted decision model, while the server remains authoritative.

### Phase 3: Organization Setup

| Order | Deliverable            | PRD                             | UI increment                                                    | Status      | Evidence |
| ----: | ---------------------- | ------------------------------- | --------------------------------------------------------------- | ----------- | -------- |
|    11 | Reference data         | `M0004: Reference Data`         | Reference-data lookup controls needed by setup forms            | Not started |          |
|    12 | Reference-data rollout | `W0004: Reference Data Rollout` | Operator rollout status, failures, and retry when required      | Not started |          |
|    13 | Business directory     | `M0005: Business Directory`     | Employee, client, vendor, contact, and address management       | Not started |          |
|    14 | Companies              | `M0006: Companies`              | Legal-entity and tax-registration management                    | Not started |          |
|    15 | Tenant settings        | `M0007: Tenant Settings`        | Numbering, preference, payment-term, and approval configuration | Not started |          |

Phase 3 is complete when a tenant administrator can establish the organization,
people, counterparties, legal entities, and settings required by later modules.

### Phase 4: Reusable Operational Foundations

| Order | Deliverable | PRD                 | UI increment                                                 | Status      | Evidence |
| ----: | ----------- | ------------------- | ------------------------------------------------------------ | ----------- | -------- |
|    16 | Catalog     | `M0008: Catalog`    | Products, materials, vendor SKUs, prices, and assemblies     | Not started |          |
|    17 | Cost codes  | `M0009: Cost Codes` | Cost-category and activity management                        | Not started |          |
|    18 | Projects    | `M0010: Projects`   | Project creation, structure, membership, and change tracking | Not started |          |

Phase 4 is complete when later commercial and delivery modules can use shared
catalog, cost, and project records through accepted contracts.

### Phase 5: Commercial Planning And Contracting

| Order | Deliverable | PRD                 | UI increment                                                       | Status      | Evidence |
| ----: | ----------- | ------------------- | ------------------------------------------------------------------ | ----------- | -------- |
|    19 | Estimating  | `M0011: Estimating` | Estimate templates, versions, cost inputs, bids, and approvals     | Not started |          |
|    20 | Sales       | `M0012: Sales`      | Opportunities, quotes, buyer selections, and approvals             | Not started |          |
|    21 | Contracts   | `M0013: Contracts`  | Agreements, versions, amendments, changes, milestones, and history | Not started |          |

Phase 5 is complete when users can move work from estimating and sales through
an executed contract without bypassing accepted approval and version rules.

### Phase 6: Project Delivery And Cost Control

| Order | Deliverable   | PRD                    | UI increment                                                     | Status      | Evidence |
| ----: | ------------- | ---------------------- | ---------------------------------------------------------------- | ----------- | -------- |
|    22 | Scheduling    | `M0014: Scheduling`    | Activities, dependencies, milestones, deliverables, and progress | Not started |          |
|    23 | Project costs | `M0015: Project Costs` | Baselines, approved changes, forecasts, rollups, and variances   | Not started |          |

Phase 6 is complete when project teams can plan work, record progress, and
compare approved costs with forecasts and actual outcomes.

### Phase 7: Finance

| Order | Deliverable         | PRD                          | UI increment                                                       | Status      | Evidence |
| ----: | ------------------- | ---------------------------- | ------------------------------------------------------------------ | ----------- | -------- |
|    24 | Accounting          | `M0016: Accounting`          | Accounts, periods, journals, posting, balances, and intercompany   | Not started |          |
|    25 | Accounts payable    | `M0017: Accounts Payable`    | Purchase orders, vendor invoices, approvals, payments, and credits | Not started |          |
|    26 | Accounts receivable | `M0018: Accounts Receivable` | Customer invoices, receipts, allocations, and credits              | Not started |          |

Phase 7 is complete when payable and receivable activity posts through the
accepted accounting rules and can be reconciled to ledger balances.

### Phase 8: Reporting

| Order | Deliverable | PRD                | UI increment                                         | Status      | Evidence |
| ----: | ----------- | ------------------ | ---------------------------------------------------- | ----------- | -------- |
|    27 | Reporting   | `M0019: Reporting` | Tenant-safe report selection, filtering, and display | Not started |          |

Phase 8 is complete when authorized users can view tenant-safe reports whose
figures reconcile to the owning modules.

## Admin Tenancy Work Units

[M0001: Admin Tenancy](../PRDs/modules/M0001-admin-tenancy.md) is a family of
independently accepted admin deliverables. Its phase-1 entry starts with the
foundation; it does not require all 12 units to finish before authentication
work can start. Work-unit numbers are not a strict delivery sequence. The
parent Admin tenancy item is complete when all 12 admin work units are complete;
the receiving cell and application milestones retain their own acceptance.

Each row becomes complete only when its accepted admin contract, including
applicable cache and event integration, is verified. Physical cell work is
tracked under the receiving deliverables below. Drafting these documents does
not change implementation progress.

| Unit | Deliverable                                      | PRD                                                                                                   | UI increment                                                 | Status      | Evidence |
| ---: | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------- | -------- |
|    1 | Admin: Tenant and Portal-User Foundation         | [M0001-01](../PRDs/modules/M0001-admin-tenancy/M0001-01-tenant-and-portal-user-foundation.md)         | None; internal foundation                                    | Not started |          |
|    2 | Admin: Root-User Provisioning                    | [M0001-02](../PRDs/modules/M0001-admin-tenancy/M0001-02-root-user-provisioning.md)                    | None; operator command                                       | Not started |          |
|    3 | Admin: Authentication                            | [M0001-03](../PRDs/modules/M0001-admin-tenancy/M0001-03-authentication.md)                            | Login and password-change flow through C0001                 | Not started |          |
|    4 | Admin: Session Management                        | [M0001-04](../PRDs/modules/M0001-admin-tenancy/M0001-04-session-management.md)                        | Restore/logout/expiry through C0002                          | Not started |          |
|    5 | Admin: Authorization                             | [M0001-05](../PRDs/modules/M0001-admin-tenancy/M0001-05-authorization.md)                             | Platform-access administration through C0003                 | Not started |          |
|    6 | Admin: Cell Management                           | [M0001-06](../PRDs/modules/M0001-admin-tenancy/M0001-06-cell-management.md)                           | Cell controls and progress through W0002                     | Not started |          |
|    7 | Admin: Tenant Creation                           | [M0001-07](../PRDs/modules/M0001-admin-tenancy/M0001-07-tenant-creation.md)                           | Tenant creation through W0001                                | Not started |          |
|    8 | Admin: Portal-User and Membership Administration | [M0001-08](../PRDs/modules/M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md) | User/membership administration through the exposing workflow | Not started |          |
|    9 | Admin: Tenant Selection and Support Access       | [M0001-09](../PRDs/modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md)       | Tenant selection through C0002; support flow through C0003   | Not started |          |
|   10 | Admin: Module Entitlements                       | [M0001-10](../PRDs/modules/M0001-admin-tenancy/M0001-10-module-entitlements.md)                       | Entitlement administration through the exposing feature      | Not started |          |
|   11 | Admin: Cache Consistency                         | [M0001-11](../PRDs/modules/M0001-admin-tenancy/M0001-11-cache-consistency.md)                         | None; internal consistency                                   | Not started |          |
|   12 | Admin: Administrative Events                     | [M0001-12](../PRDs/modules/M0001-admin-tenancy/M0001-12-administrative-events.md)                     | Authorized history through the exposing admin UI             | Not started |          |

Define units 11 and 12 early enough for their consumers to meet their cache and
event requirements. Resolve the identity, credential, and initial-authority
contracts before bootstrap; resolve session, membership, and platform-access
contracts before tenant selection or support integration.

### Feature And Workflow Ownership

| Existing deliverable              | Admin contract to reference      | Remaining delivery                                                                  |
| --------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| C0001: Authentication             | M0001-03                         | Application login/password-change flow, UI, and session integration                 |
| C0002: Session Management         | M0001-04 and M0001-09            | Browser restoration/logout/selection, shell context, and runtime integration        |
| C0003: RBAC                       | M0001-05 and M0001-09            | Broader authorization decisions, cell-role integration, and permission-aware UI     |
| W0002: Cell Provisioning          | M0001-06                         | Physical setup through activation, runtime readiness, recovery, and operator UI     |
| W0001: Tenant Provisioning        | M0001-07 and M0001-08            | Assignment, projections, business identities, activation, recovery, and operator UI |
| W0003: Projection Synchronization | M0001-08, M0001-10, and M0001-11 | Delivery, reconciliation, and freshness across admin and cells                      |

These planned documents own integration behavior, not a second definition of the
admin requirements. Module and application code placement remains unchanged.

### Admin-To-Cell Integration Dependencies

All receiving work below is not started. The referenced roadmap deliverable owns
its completion evidence; successful admin tests do not satisfy that evidence.

| Admin source | Receiving deliverable                                             | Integration to implement and verify                                                                                  |
| ------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Units 01–04  | None                                                              | Foundation, bootstrap, authentication, and session persistence have no cell dependency                               |
| Unit 05      | Cell tenancy, Tenant access-control data, and RBAC decision model | Seed applicable roles into `cell.roles`; settle cell-role ownership; assign `tenant_admin` and custom roles in cells |
| Unit 06      | Cell provisioning and runtime infrastructure                      | Create, migrate, verify, and activate the physical database; publish runtime readiness                               |
| Unit 07      | Tenant provisioning, Cell tenancy, and Projection synchronization | Assign cells, project `cell.tenants`, provision, activate, and synchronize status                                    |
| Unit 08      | Tenant provisioning, Cell tenancy, and Business directory         | Establish `cell.tenant_user_bindings` and employee, client, vendor, or vendor-contact records                        |
| Unit 09      | Session management and tenant selection; RBAC decision model      | Open and authorize the selected or support tenant transaction in the assigned cell                                   |
| Unit 10      | Cell tenancy, Projection synchronization, and RBAC decision model | Populate `cell.entitlement_projections` and enforce entitlements in cells                                            |
| Unit 11      | Cell tenancy and Projection synchronization                       | Define cell-local cache revisions and invalidation guarantees                                                        |
| Unit 12      | Each receiving cell module                                        | Define and verify cell-local audit events where required                                                             |

The work breakdown's “Core” identity dependency maps to the current
`business-directory` module. The exact cell-role and binding contracts remain
receiving-owner decisions; these draft admin PRDs do not silently change the
module map or cell schema ownership.

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

| Date | Item | Change | Evidence |
| ---- | ---- | ------ | -------- |
|      |      |        |          |

## Current Blockers

None recorded.
