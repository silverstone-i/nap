# ADR-0013: Four-Layer Scoped RBAC

**Status:** Accepted (supersedes ADR-0004)

**Date:** 2025-02-18

## Context

ADR-0004's three-level model (none/view/full) only controls
what operations a user can perform. It cannot restrict which
rows or columns they see. Construction ERP users need
project-scoped, company-scoped, and self-scoped data access,
status-based visibility, and column-level restrictions.

## Decision

Extend RBAC to four narrowing layers:

### Layer 1 — Role Policies (capabilities)
Maps `(role, module, router, action)` to a permission level
(none, view, full). Resolution hierarchy (most specific first):
1. `module::router::action`
2. `module::router::`
3. `module::::`
4. `::::` (empty-module wildcard)
5. Default: `none`

Multi-role merge: most permissive level wins.

### Layer 2 — Data Scope
Each role has a scope: `all_projects`,
`assigned_companies`, `assigned_projects`, or `self`.
Multi-role merge: broadest scope wins. Implemented via
`project_members` and `company_members` tables. `self`
scope filters by the user's own entity FK column.

### Layer 3 — State Filters
`state_filters` table restricts which record statuses a
role can see per resource. Multi-role merge: union of
visible statuses.

### Layer 4 — Field Groups
`field_group_definitions` define named column sets per
resource. `field_group_grants` assign groups to roles.
`is_default` groups are always visible. Multi-role merge:
union of granted columns.

### Key principle
Layers 2-4 only narrow within Layer 1. They never expand
access beyond what Layer 1 grants.

### No bypass
System roles (super_user, admin, support) are implemented
as seeded roles with full policies. They go through the
same resolution path as all other roles.

## Consequences

- Fine-grained access control without per-query custom SQL.
- `ViewController._applyRbacFilters()` applies Layers 2-4
  automatically for controllers that set `rbacConfig`.
- Permission canon is cached in Redis (ADR-0007) to avoid
  repeated multi-table joins.
- Adding new resources requires seeding policy_catalog
  entries and optionally field_group_definitions.
