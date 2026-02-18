# 0013. Four-Layer Scoped RBAC

**Date:** 2025-02-18
**Status:** accepted
**Author:** NapSoft
**Supersedes:** [ADR-0004](./0004-three-level-rbac.md) (Three-Level RBAC over Boolean Permissions)

## Context

ADR-0004 introduced a three-level permission model (`none`/`view`/`full`) with hierarchical policy resolution. This answered "can this role use this feature?" effectively, but as NAP grew into a full construction ERP with multi-project organizations, the flat model could not answer critical business questions:

- Can this PM see **their** invoices but not other PMs' invoices?
- Can a PM see invoices but not client financial details?
- Can a controller see everything across **all** projects?
- Can a CFO see reports but not edit anything?

Layer 1 (policies) controls what a role can *do*, but it says nothing about *which data* that role can see, *which record states* are visible, or *which columns* are exposed. A construction firm with 30 projects and 8 project managers cannot give every PM access to every project's financials — scoping is essential.

## Decision

Evolve the permission model to four layers. Each layer **narrows** what the previous layer grants — layers 2-4 never expand access beyond what Layer 1 allows.

| Layer | Question Answered | Mechanism |
|-------|-------------------|-----------|
| **1 — Role Policies** | What can this role DO? | Existing `policies` table (unchanged from ADR-0004) |
| **2 — Data Scope** | HOW MUCH data? | `scope` column on `roles` + `project_members` join table |
| **3 — Record State Filters** | Which record STATES are visible? | New `state_filters` table |
| **4 — Field Groups** | Which COLUMNS are visible? | New `field_group_definitions` + `field_group_grants` tables |

### Layer 1 — Role Policies (unchanged)

The `none`/`view`/`full` permission model with hierarchical policy resolution from ADR-0004 remains exactly as designed. The three-level model, the specificity hierarchy (`module::router::action` > `module::router` > `module` > default), and the middleware chain are all retained.

### Layer 2 — Data Scope

The `roles` table gains a `scope` column with three tiers ordered by breadth:

- `all_projects` (default, broadest): Role sees data across the entire tenant — no project filtering.
- `assigned_companies`: Role only sees data from projects belonging to inter-companies the user is assigned to via `company_members`. The permission loader eagerly resolves both `companyIds` and the corresponding `projectIds` so downstream resources with either `company_id` or `project_id` scope columns can be filtered.
- `assigned_projects` (narrowest): Role only sees data belonging to projects they are explicitly assigned to via `project_members`.

A `project_members` table maps `(project_id, user_id)` with a `role` label (e.g., `member`, `lead`). A `company_members` table maps `(company_id, user_id)` for company-level scoping.

When a user has multiple roles, the most permissive scope wins using `SCOPE_ORDER`: `all_projects` (2) > `assigned_companies` (1) > `assigned_projects` (0).

### Layer 3 — Record State Filters

A new `state_filters` table stores `(role_id, module, router, visible_statuses[])`. This controls which record states a role can see for a given resource — e.g., a PM may only see AR invoices with status `approved` or `sent`, not `draft` or `void`.

When a user has multiple roles with state filters on the same resource, the **union** of visible statuses applies (most permissive merge).

Empty state filters (no rows) means no filtering — all statuses are visible.

### Layer 4 — Field Groups

Two new tables:
- `field_group_definitions`: Named groups of columns per resource — e.g., `(module: 'ar', router: 'invoices', group_name: 'summary', columns: ['id','number','status','amount'])`.
- `field_group_grants`: Assigns field groups to roles.

Definitions marked `is_default = true` are automatically granted to all roles. When a user has multiple roles, the **union** of all granted columns applies.

Empty field group grants (no rows) means all columns are visible — the system is permissive by default.

### Enforcement

- **Middleware (Layer 1):** Unchanged — `rbac(requiredLevel)` gates route access.
- **Service layer (Layers 2-4):** `ViewController` applies scope, state, and field filters before querying. Controllers opt in via `this.rbacConfig = { module, router, scopeColumn }`.
- **System role bypass:** `super_user` and `admin` bypass all four layers entirely.

### Permission Canon

The permission loader (`RbacPolicies.js`) returns a "canon" object:

```js
{
  caps: { 'projects::::': 'full', 'ar::::': 'view' },              // Layer 1
  scope: 'assigned_companies',                                      // Layer 2
  projectIds: ['uuid1', 'uuid2'],                                   // Layer 2
  companyIds: ['company-uuid1'],                                    // Layer 2
  stateFilters: { 'ar::ar-invoices': ['approved', 'sent'] },       // Layer 3
  fieldGroups: { 'ar::ar-invoices': ['id', 'number', 'amount'] },  // Layer 4
}
```

This canon is cached in Redis alongside the existing permission hash mechanism (ADR-0007). Hash changes from canon expansion trigger `X-Token-Stale` correctly.

### Tenant Configurability

All roles except `super_user` and `admin` are tenant-configurable. Tenants define their own roles, assign scopes, create state filters, and build field groups. The system seeds sensible defaults (`admin` with `all_projects`, `project_manager` with `assigned_projects`, `controller` with `assigned_companies`) but tenants can modify everything.

### Router Naming Convention

Router names in policies use URL path segments as the canonical convention (e.g., `ar-invoices`, not `invoices`). This ensures consistency between the `withMeta()` annotation on routes and the policy keys stored in the database. The `policy_catalog` table codifies all valid module/router/action combinations as discoverable reference data.

### New Tables

| Table | Schema | Purpose |
|-------|--------|---------|
| `project_members` | tenant | Maps users to projects for scope enforcement |
| `company_members` | tenant | Maps users to inter-companies for `assigned_companies` scope enforcement |
| `state_filters` | tenant | Restricts visible record statuses per role per resource |
| `field_group_definitions` | tenant | Defines named column groups per resource |
| `field_group_grants` | tenant | Assigns column groups to roles |
| `policy_catalog` | tenant | Registry of valid module/router/action combinations for role configuration UI |

### Modified Tables

| Table | Change |
|-------|--------|
| `roles` | Added `scope varchar(32) NOT NULL DEFAULT 'all_projects'` with CHECK constraint (`all_projects`, `assigned_companies`, `assigned_projects`) |

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| Keep flat RBAC + add ad-hoc WHERE clauses per controller | No schema changes; quick | Inconsistent enforcement; every controller implements its own scoping logic; easy to miss edge cases |
| Full ABAC (attribute-based access control) | Maximum flexibility; can express any policy | Massive complexity; requires a policy language (Rego/Cedar); overkill for NAP's current needs; difficult for administrators to configure |
| Row-level security (RLS) in PostgreSQL | Enforcement at DB layer; impossible to bypass from app code | Tight coupling to DB; harder to test; doesn't solve field-level or state-level filtering; poor DX with pg-schemata's dynamic schema model |
| Single "scope" enum without project_members table | Simpler — no join table needed | Can't support partial project assignment; only works for "all or nothing" scoping |

## Consequences

**Positive:**
- Answers all four ERP scoping questions without ABAC complexity
- Backward compatible — Layer 1 behavior is identical to ADR-0004; layers 2-4 default to permissive (no data filtered) when unconfigured
- Opt-in enforcement — controllers that don't declare `rbacConfig` are unaffected
- Tenant-configurable — organizations define their own roles and scoping rules
- Multi-role merge uses most-permissive strategy (scope: broadest wins; statuses/columns: union) — avoids accidental lockouts
- Clean separation of concerns: middleware handles Layer 1, service layer handles Layers 2-4

**Negative:**
- Additional queries during permission loading (roles scope, project_members, state_filters, field_group_grants) — mitigated by Redis caching
- Controllers must opt in to Layers 2-4 via `rbacConfig` — enforcement is not automatic
- `project_members` table creates a cross-module dependency (core RBAC referencing projects) — mitigated by ALTER TABLE FK pattern
- State filter and field group administration will need UI (not yet built)
