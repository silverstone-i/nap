# Project Lifecycle Rules

## Table Hierarchy

| Table | Parent FK | Cascade | Notes |
|-------|-----------|---------|-------|
| `projects` | inter_companies (RESTRICT), clients (SET NULL), addresses (SET NULL) | — | Root entity, tenant-scoped |
| `units` | projects (CASCADE) | CASCADE from project | Also optionally references template_units (SET NULL) |
| `tasks` | units (CASCADE) | CASCADE from unit | Self-referential parent_task_id (SET NULL) |
| `cost_items` | tasks (CASCADE) | CASCADE from task | Generated `amount` column |
| `change_orders` | units (CASCADE) | CASCADE from unit | — |
| `task_groups` | — | — | Tenant-level reference table |
| `tasks_master` | task_groups (composite FK, RESTRICT) | — | Composite FK: (tenant_id, task_group_code) |

## Project Status Workflow

Projects follow a forward-only status progression:

```
planning → budgeting → released → complete
```

- **planning**: Initial state after creation
- **budgeting**: Project scope defined, budgets being prepared
- **released**: Work authorized to begin
- **complete**: All work finished

Backward transitions are rejected with HTTP 400. The controller validates the transition before delegating to the base update.

## Generated Columns

`cost_items.amount` and `template_cost_items.amount` are PostgreSQL `GENERATED ALWAYS AS (quantity * unit_cost) STORED` columns:

- Computed automatically on INSERT and UPDATE
- Cannot be set directly via API — the value is always derived
- Recalculates when either `quantity` or `unit_cost` changes
- Stored as `numeric(12,2)` for financial precision
- **Important**: These columns are excluded from the pg-schemata schema `columns` array and added via `ALTER TABLE` in the migration. This avoids pg-schemata including them in INSERT/UPDATE ColumnSets, which would cause PostgreSQL to reject the operation. The columns are still returned by `RETURNING *` and `SELECT *`.

## Composite Foreign Key

`tasks_master` uses a composite FK `(tenant_id, task_group_code) → task_groups(tenant_id, code)` with `ON DELETE RESTRICT`. This ensures:

- A tasks_master record always references a valid task group within the same tenant
- A task group cannot be deleted while tasks_master records reference it

This FK is added via `ALTER TABLE` in the migration because pg-schemata FK definitions only support references to primary keys.

## Soft Delete Convention

All project tables use `softDelete: true`. The `deactivated_at` column convention applies:

- Active records: `deactivated_at IS NULL`
- Archived records: `deactivated_at IS NOT NULL`
- Conditional unique indexes use `WHERE deactivated_at IS NULL` to allow re-creation of archived codes

## Template Tables

Template tables (`template_units`, `template_tasks`, `template_cost_items`, `template_change_orders`) provide blueprints for creating units from predefined configurations. Units optionally reference a `template_unit_id` to track which template was used and the `version_used` at time of creation.

## API Routes

All project module routes are mounted under `/api/projects/v1/`:

| Endpoint | Entity |
|----------|--------|
| `/api/projects/v1/projects` | Projects |
| `/api/projects/v1/units` | Units |
| `/api/projects/v1/tasks` | Tasks |
| `/api/projects/v1/cost-items` | Cost Items |
| `/api/projects/v1/change-orders` | Change Orders |
| `/api/projects/v1/task-groups` | Task Groups |
| `/api/projects/v1/tasks-master` | Tasks Master |
| `/api/projects/v1/template-units` | Template Units |
| `/api/projects/v1/template-tasks` | Template Tasks |
| `/api/projects/v1/template-cost-items` | Template Cost Items |
| `/api/projects/v1/template-change-orders` | Template Change Orders |
