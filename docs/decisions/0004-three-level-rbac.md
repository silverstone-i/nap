# 0004. Three-Level RBAC (none/view/full) over Boolean Permissions

**Date:** 2025-02-17
**Status:** accepted
**Author:** NapSoft

## Context

NAP requires role-based access control that distinguishes between users who should see data (e.g., a project manager reviewing invoices) and users who can modify it (e.g., an accountant approving payments). A boolean permission model (has access / no access) forces a binary choice — either a user can do everything on a resource or nothing. Financial ERP operations frequently need a middle ground: read-only access for oversight without mutation rights.

## Decision

Permissions use three ordered levels: `none` (0) < `view` (1) < `full` (2).

**Data model** (per tenant schema): `roles`, `role_members`, `policies` tables. Each policy row specifies `(role_id, module, router, action, level)`.

**Policy resolution** follows a specificity hierarchy (most specific wins):
1. `module::router::action` (e.g., `ar::invoices::approve`)
2. `module::router` (e.g., `ar::invoices`)
3. `module` (e.g., `ar`)
4. Default: `none`

**Middleware chain:** `withMeta({ module, router, action })` annotates `req.resource` → `rbac(requiredLevel)` compares the resolved level against the required level → 403 on denial.

**Default levels:** GET/HEAD require `view`; POST/PUT/PATCH/DELETE require `full`.

**System roles:** `super_user` bypasses all checks (NapSoft-only); `admin` has full control within a tenant but is blocked from the `tenants` module.

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| Boolean permissions (has/no access) | Simpler model; fewer states to manage | Cannot distinguish read-only oversight from full mutation access; forces all-or-nothing per resource; common in CRUD apps but insufficient for financial workflows |
| Fine-grained action-level booleans (e.g., `can_read`, `can_create`, `can_update`, `can_delete`, `can_approve`) | Maximum granularity per action | Exponential policy rows; complex UI for policy management; most NAP resources need only the read/write distinction |

## Consequences

**Positive:**
- Granular read vs. write control — managers can view reports without risk of accidental mutations
- Hierarchical policy resolution reduces policy row count — a single `module`-level policy covers all routers and actions unless overridden
- Clean middleware integration — a single numeric comparison (`resolvedLevel >= requiredLevel`) handles all authorization checks
- Audit-friendly — permission levels are easy to log and reason about

**Negative:**
- Three levels may occasionally be insufficient (e.g., `approve` as a distinct level above `full`) — mitigated by action-level policy granularity (`ar::invoices::approve` can have its own level)
- Policy resolution hierarchy adds complexity compared to a flat permission lookup
- Per-tenant RBAC tables mean policy changes must be applied within each tenant's schema independently
