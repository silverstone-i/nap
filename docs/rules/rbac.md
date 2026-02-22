# RBAC Business Rules

## Permission Resolution

1. Roles are stored as `text[]` on entity records
   (employees, vendors, clients, contacts).
2. `nap_users.entity_type` + `entity_id` links to the
   entity record in the tenant schema.
3. Permission loader reads the entity's `roles` array,
   looks up matching role definitions in the `roles` table,
   then queries `policies` for those role IDs.

## Four-Layer Model

### Layer 1 — Capabilities
- Resolution hierarchy (most specific wins):
  `module::router::action` > `module::router::` > `module::::`
- Default if no match: `none`
- Multi-role merge: highest level wins
  (`full` > `view` > `none`)

### Layer 2 — Data Scope
- Scope hierarchy: `all_projects` > `assigned_companies` >
  `assigned_projects` > `self`
- Multi-role merge: broadest scope wins
- `assigned_companies`: user sees data from projects
  belonging to their assigned inter-companies
- `assigned_projects`: user sees data from their assigned
  projects only
- `self`: user sees only records matching their entity FK
  (e.g., vendor_id, employee_id)

### Layer 3 — State Filters
- `state_filters` table: `(role_id, module, router,
  visible_statuses[])`
- No row for a role+resource = all statuses visible
- Multi-role merge: union of visible statuses

### Layer 4 — Field Groups
- `field_group_definitions`: named column sets per resource
- `field_group_grants`: assigns groups to roles
- `is_default` groups always visible when field groups are
  active for a resource
- Multi-role merge: union of columns across all grants

## Narrowing Principle

Layers 2-4 only narrow access within Layer 1. They can
never expand access beyond what Layer 1 grants.

## System Roles

All system roles resolve through full RBAC — no bypass.

| Role | Scope | Tenants | Policies |
|------|-------|---------|----------|
| super_user | NapSoft only | all_projects | full for all modules |
| admin | All tenants | all_projects | full for all modules |
| support | NapSoft only | all_projects | full except accounting/ap/ar (none) |

## Redis Cache

- Key: `perm:{userId}:{tenantCode}`
- TTL: 15 minutes
- Invalidated on role/policy changes
- Falls back to DB when Redis unavailable

## Stale Token Detection

- JWT `ph` claim = SHA-256 of permission canon
- When cached permissions diverge from token's `ph`,
  response includes `X-Token-Stale: 1` header
- Client silently refreshes access token on stale signal

## Module Entitlement

- `tenants.allowed_modules` (jsonb array) controls which
  modules a tenant can access
- Empty array = all modules allowed
- Enforced by `moduleEntitlement` middleware before RBAC
- Returns 403 if module not entitled

## Middleware Chain

```
authRedis → withMeta → moduleEntitlement → rbac → controller
```

- `withMeta({ module, router, action })` annotates
  `req.resource`
- `moduleEntitlement` checks tenant's `allowed_modules`
- `rbac(level)` enforces Layer 1 capabilities
- Controller's `_applyRbacFilters()` applies Layers 2-4
