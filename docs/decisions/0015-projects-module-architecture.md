# ADR-0015: Projects Module Architecture

**Status**: Accepted
**Date**: 2025-02-22

## Context

The application needs project management capabilities: projects containing units, tasks (with hierarchy), cost items (with computed totals), and change orders. This is the first optional feature module beyond the core entity system. We needed to decide how to structure feature modules vs. core platform code, how to handle generated columns, and how to implement a composite foreign key that references a non-PK unique constraint.

## Decision

### Feature Module Pattern (src/system/ vs src/modules/)

Feature modules live in `apps/nap-serv/src/modules/` (lowercase), separate from core platform code in `src/system/`. Each module is self-contained with its own schemas, models, controllers, routers, and migrations. Modules import platform code via relative paths (e.g., `../../../lib/BaseController.js`, `../../../system/core/` for platform modules).

Registration happens in `src/db/moduleRegistry.js` with `{ name, scope, repositories, migrations }`. This keeps module code decoupled from the platform while still leveraging shared infrastructure (BaseController, createRouter, pg-schemata, defineMigration).

### Generated Columns (cost_items.amount)

Cost items and template cost items use PostgreSQL `GENERATED ALWAYS AS (quantity * unit_cost) STORED` columns. The `amount` column is **excluded from the pg-schemata schema `columns` array** and added via `ALTER TABLE` in the migration:

```sql
ALTER TABLE {schema}.cost_items
ADD COLUMN amount numeric(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED;
```

**Rationale**: pg-schemata's ColumnSet cannot skip columns during INSERT (pg-promise's `skip` only works for UPDATE). Including a GENERATED column in the schema `columns` array causes the ColumnSet to emit `amount = null` during INSERT, which PostgreSQL rejects for `GENERATED ALWAYS` columns. By excluding it from the schema and adding it via ALTER TABLE, the column is absent from INSERT/UPDATE ColumnSets but still returned by `RETURNING *` and `SELECT *`.

The amount is computed by the database engine on INSERT and UPDATE, guaranteeing consistency without application-level calculation.

### Composite Foreign Key (tasks_master → task_groups)

`tasks_master` references `task_groups` via a composite key `(tenant_id, task_group_code) → (tenant_id, code)`. Since this references a non-PK unique constraint, pg-schemata's FK definition cannot express it. The FK is added via `ALTER TABLE` in the migration, following the same pattern used for circular FKs (see ADR-0014).

### Project Status Workflow

Projects enforce a forward-only status workflow: `planning → budgeting → released → complete`. The controller validates transitions before delegating to the base update. Backward transitions are rejected with HTTP 400.

### Table Hierarchy and Cascade

```
projects → units → tasks → cost_items
                  → change_orders
```

FK cascades use `ON DELETE CASCADE` for parent-child relationships, meaning deleting a project hard-deletes all children. In practice, soft-delete (`deactivated_at`) is used at the application level.

## Consequences

- **Module isolation**: Feature modules can be developed and tested independently
- **Database-computed amounts**: No risk of application-level calculation drift; amounts are always consistent
- **Forward-only workflow**: Prevents accidental status regression; business logic enforced at controller layer
- **Composite FK via migration**: Requires awareness of the ALTER TABLE pattern when working with tasks_master
- **11 new tenant-schema tables**: Each provisioned tenant gets the full project table set
