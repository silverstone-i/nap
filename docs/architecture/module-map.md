# Module Map

## Purpose

This document defines NAP's module boundaries and shows how the modules
contribute to the application.

## Why

Each table belongs to one module. The module map prevents overlapping ownership
and shows which modules must work together to provide a product area.

## Modules

| Module                | Database/schema  | Purpose                                                                                                                                                |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `admin-tenancy`       | `admin/admin`    | Owns tenants, cells, portal users, memberships, sessions, module entitlements, all portal-user role assignments, and provisioning records.             |
| `cell-tenancy`        | `cell/cell`      | Holds the cell's physical identity, the tenant, membership, and entitlement copies used to enforce access inside a cell, and the cell-to-admin outbox. |
| `reference-data`      | `cell/reference` | Owns shared reference data such as countries and currencies.                                                                                           |
| `business-directory`  | `cell/app`       | Owns employees, clients, vendors, vendor contacts, contacts, addresses, and contact methods.                                                           |
| `companies`           | `cell/app`       | Owns legal entities and their tax registrations.                                                                                                       |
| `access-control`      | `cell/app`       | Owns tenant-local role definitions, permissions, and access scopes.                                                                                    |
| `tenant-settings`     | `cell/app`       | Owns numbering, preferences, payment terms, and approval configuration.                                                                                |
| `catalog`             | `cell/app`       | Owns products, materials, vendor SKUs and prices, SKU matching, and material assemblies.                                                               |
| `projects`            | `cell/app`       | Owns projects, project components, memberships, and operational project changes.                                                                       |
| `cost-codes`          | `cell/app`       | Owns the categories and activities used to classify project work and costs.                                                                            |
| `estimating`          | `cell/app`       | Owns estimate templates, versions, cost inputs, bids, approvals, and release to production.                                                            |
| `scheduling`          | `cell/app`       | Owns schedules, activities, dependencies, milestones, deliverables, and completion state.                                                              |
| `project-costs`       | `cell/app`       | Owns project cost baselines, approved changes, forecasts, rollups, and variances.                                                                      |
| `sales`               | `cell/app`       | Owns opportunities, quotes, buyer selections, and approvals before contract execution.                                                                 |
| `contracts`           | `cell/app`       | Owns agreements, immutable contract versions, amendments, contractual changes, milestones, and execution history.                                      |
| `accounting`          | `cell/app`       | Owns ledgers, accounts, journals, balances, periods, posting, and intercompany activity.                                                               |
| `accounts-payable`    | `cell/app`       | Owns purchase orders, vendor invoices, payment approvals, payments, allocations, and vendor credits.                                                   |
| `accounts-receivable` | `cell/app`       | Owns customer invoices, receipts, allocations, and customer credits.                                                                                   |
| `reporting`           | `cell/reporting` | Owns tenant-safe reporting views.                                                                                                                      |

## How The Modules Fit Together

`admin-tenancy` assigns each tenant to a cell and records which modules the
tenant can use. `cell-tenancy` stores the projections needed to enforce that
assignment inside the cell.

`reference-data` supplies shared values. `business-directory` owns employees,
clients, vendors, vendor contacts, and contacts. `companies` owns the tenant's legal entities.
Projects, accounting, RBAC, and reporting use those company records.

`access-control` owns tenant-local role definitions and access scopes.
System roles are seeded into the same role table as tenant-defined roles:
`tenant_admin` for every tenant, and `platform_admin` and `support` only for the
configured owning tenant. `admin-tenancy` stores all portal-user role assignments
in `admin.platform_roles`; it validates the referenced role in the tenant's cell.
The root user is the exception: software grants the `platform_admin` capability
set from `admin.portal_users.is_root` without a role assignment. `tenant-settings`
owns tenant-wide configuration used by business modules.

`catalog` and `cost-codes` provide reusable product and cost definitions.
`estimating` uses those definitions to build and approve estimates.

`sales` owns work before an agreement is executed. `contracts` owns executed
agreements and later contractual changes.

`projects` owns the structure of active work. `scheduling` owns when that work
happens. `project-costs` owns its approved costs, forecasts, and variances.

`accounts-payable` owns money owed to vendors. `accounts-receivable` owns money
owed by customers. `accounting` owns the resulting financial entries and
balances.

`reporting` provides tenant-safe views of data owned by the other cell modules.

## Product Areas

A product area groups related features in the UI. It does not own tables.

| Product area              | Contributing modules                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| Admin                     | `admin-tenancy`, `cell-tenancy`                                                          |
| Authentication and access | `admin-tenancy`, `cell-tenancy`, `access-control`                                        |
| Organization Setup        | `reference-data`, `business-directory`, `companies`, `access-control`, `tenant-settings` |
| Catalog                   | `catalog`                                                                                |
| Projects                  | `projects`, `scheduling`, `project-costs`, `cost-codes`, `accounts-payable`, `contracts` |
| Budgets                   | `project-costs`, `estimating`, `cost-codes`                                              |
| Estimating                | `estimating`, `catalog`, `cost-codes`, `projects`                                        |
| Sales                     | `sales`                                                                                  |
| Contracts                 | `contracts`                                                                              |
| Accounting                | `accounting`                                                                             |
| Accounts payable          | `accounts-payable`                                                                       |
| Accounts receivable       | `accounts-receivable`                                                                    |
| Reporting                 | `reporting`                                                                              |

RBAC is an inter-module workflow that uses `admin-tenancy` and
`access-control` data. Session resolution uses `admin-tenancy` data.
Provisioning and projection synchronization are inter-module workflows. None
of them are modules.
