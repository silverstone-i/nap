# 0011 — RBAC schema: roles, role_cells, entity_roles, cell_catalog

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

ADR-0007 fixed the grant shape; this ADR records the tables that carry
it. They live in each tenant schema, beside the data they govern.

## Decision

1. **Four tenant-schema tables** (audit columns omitted):

   ```
   roles         id uuid PK, code varchar(32), name varchar(64),
                 description text, is_system boolean,
                 tenant_code varchar(6)
   role_cells    role_id FK roles, module varchar(32),
                 router varchar(64), action varchar(32) default '',
                 level varchar(8), scope varchar(32),
                 visible_statuses text[] default '{}',
                 UNIQUE(role_id, module, router, action)
   entity_roles  source_id FK sources, role_id FK roles,
                 UNIQUE(source_id, role_id)
   cell_catalog  read-only seed of valid (module, router, action)
                 with labels, sort_order, valid_statuses per router
   ```

2. **Role assignment is a join table.** `entity_roles` links the
   tenant-side entity (`sources`) to roles; a login reaches its roles
   through its `admin.portal_user_tenants` binding's `entity_id`.
   Foreign keys guarantee no grant outlives a role rename or delete.
3. **`cell_catalog` is the seeded registry of grantable cells.** Role
   editors render from it and `role_cells` rows are validated against
   it; it carries labels and valid statuses, never grants.
4. **Every RBAC-governed resource is filterable.** By `project_id`
   and/or `company_id` for the membership scopes, or by an entity
   foreign key for `self` scope. A resource that cannot be filtered
   cannot be scoped and must not ship under RBAC.

## Consequences

- The existing core models `Policies.ts`, `PolicyCatalog.ts`,
  `StateFilters.ts`, `FieldGroupDefinitions.ts`, and
  `FieldGroupGrants.ts` (`apps/api/src/modules/core/models/`)
  implement a superseded layered shape. The RBAC implementation
  replaces them with `role_cells` and `cell_catalog` models; that code
  change lands with the implementation, not with this ADR.
- Provisioning seeds `cell_catalog`, the five system roles
  (`is_system`, immutable), and the editable template roles into each
  new tenant schema — PRD 0002's reference-data step, with
  `cell_catalog` in place of the policy catalog named there. The roles
  and their grants are defined in PRD 0003.
- The membership scopes lean on `company_members` and
  `project_members`; `project_members` does not exist yet and must
  land with the first `assigned_projects` grant.

## Alternatives considered

**`roles text[]` on entity rows.** Rejected. No foreign-key integrity:
renaming or deleting a role silently orphans every array entry, and
finding a role's holders is an array scan across entity tables instead
of one join through `entity_roles`.
