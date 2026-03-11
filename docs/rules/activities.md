# Activities Module Rules

## Table Hierarchy

| Table | Parent FK | Cascade | Notes |
|-------|-----------|---------|-------|
| `categories` | — | — | Tenant-level reference; type IN (labor, material, subcontract, equipment, other) |
| `activities` | categories (CASCADE) | CASCADE from category | Code unique per tenant |
| `deliverables` | — | — | Status-gated lifecycle |
| `deliverable_assignments` | deliverables (CASCADE), projects (CASCADE), employees (SET NULL) | CASCADE from deliverable or project | Junction table |
| `budgets` | deliverables (CASCADE), activities (CASCADE) | CASCADE from deliverable or activity | Versioned; version + is_current tracking |
| `cost_lines` | inter_companies (RESTRICT), deliverables (CASCADE), activities (CASCADE), vendors (SET NULL), budgets (SET NULL) | CASCADE from deliverable or activity | Generated `amount` column |
| `actual_costs` | activities (CASCADE), projects (SET NULL) | CASCADE from activity | Approval-gated GL posting |
| `vendor_parts` | vendors (CASCADE) | CASCADE from vendor | Vendor SKU → tenant SKU pricing map |

## Deliverable Status Workflow

```
pending → released → finished
   │          │
   └→ canceled ←┘
```

- **pending**: Initial state
- **released**: Work authorized — requires an approved, current budget
- **finished**: Deliverable complete (terminal)
- **canceled**: Deliverable abandoned (terminal)

Invalid transitions are rejected with HTTP 400.

## Budget Status Workflow

```
draft → submitted → approved → locked
                  ↘ rejected
```

- **draft**: Initial state; editable
- **submitted**: Awaiting approval — records `submitted_by` and `submitted_at`
- **approved**: Budget approved — records `approved_by` and `approved_at`; record becomes read-only
- **locked**: Finalized (terminal)
- **rejected**: Denied (terminal)

Approved or locked budgets cannot be edited. Amendments require creating a new version via the `POST /new-version` endpoint, which:

1. Marks the current version `is_current = false`
2. Creates a new draft with incremented `version`, inheriting `deliverable_id`, `activity_id`, and `budgeted_amount`

Index on `(deliverable_id, activity_id, version)` (non-unique; uniqueness is enforced at the application layer).

## Cost Line Status Workflow

```
draft → locked → change_order
```

- **draft**: Initial state; editable
- **locked**: Finalized
- **change_order**: Modified after lock (terminal)

> **Note:** The schema CHECK constraint allows `draft`, `submitted`, `approved`, `change_order` but the controller's `VALID_TRANSITIONS` only permits `draft → locked → change_order`. The `submitted` and `approved` values in the CHECK are unused; `locked` is missing from the CHECK.

### Generated Column

`cost_lines.amount` is `GENERATED ALWAYS AS (quantity * unit_price) STORED`. It is excluded from the pg-schemata schema columns array and added via `ALTER TABLE` in the migration. The `source_type` column is validated as `'material'` or `'labor'`.

## Actual Cost Approval Workflow

```
pending → approved
        ↘ rejected
```

- **pending**: Initial state
- **approved**: Triggers GL posting (debit Expense/WIP, credit AP/Accrual)
- **rejected**: Denied (terminal)

## Soft Delete Convention

All activity tables use `softDelete: true` with a `deactivated_at` column:

- Active records: `deactivated_at IS NULL`
- Archived records: `deactivated_at IS NOT NULL`

## API Routes

All activity module routes are mounted under `/api/activities/v1/`:

| Endpoint | Entity | Custom |
|----------|--------|--------|
| `/api/activities/v1/categories` | Categories | — |
| `/api/activities/v1/activities` | Activities | — |
| `/api/activities/v1/deliverables` | Deliverables | Status-gated transitions |
| `/api/activities/v1/deliverable-assignments` | Deliverable Assignments | — |
| `/api/activities/v1/budgets` | Budgets | `POST /new-version` for versioning |
| `/api/activities/v1/cost-lines` | Cost Lines | source_type validated |
| `/api/activities/v1/actual-costs` | Actual Costs | Approval-gated |
| `/api/activities/v1/vendor-parts` | Vendor Parts | — |
