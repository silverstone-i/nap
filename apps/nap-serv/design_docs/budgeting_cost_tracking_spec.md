# nap-serv: Budgeting & Cost Tracking Design

## Project Structure Hierarchy

```text
projects
  └── units
        └── unit_budgets
              └── activities (linked to categories)
                    └── cost_lines
                          └── actual_costs
                          └── change_order_lines (optional)
```

---

## Key Tables and Roles

### `projects`
Defines the overall job (e.g., development, consulting engagement).

### `units`
Instances of house plans or sub-projects within a project.

### `unit_budgets`
Versioned budget per unit. Final budget must be approved before release.

| Field | Description |
|-------|-------------|
| id | UUIDv7 |
| unit_id | FK to `units` |
| version | Integer |
| status | `draft`, `submitted`, `approved` |
| approved_by | User ID |
| approved_at | Timestamp |

---

### `cost_lines`
Atomic scoped line items for budgeting.

| Field | Description |
|-------|-------------|
| id | UUIDv7 |
| unit_budget_id | FK to approved budget |
| activity_id | FK to `activities` |
| vendor_id | Optional FK |
| quantity | Work units |
| unit_cost | Cost per unit |
| total_cost | Derived or stored |

---

### `actual_costs`
Tracks real-world spend per cost line.

| Field | Description |
|-------|-------------|
| id | UUIDv7 |
| cost_line_id | FK to `cost_lines` (nullable if change order only) |
| change_order_line_id | Optional FK |
| vendor_id | FK |
| quantity | Actual quantity |
| unit_cost | Actual rate |
| amount | Total (quantity * unit_cost) |
| date_incurred | Date of cost |
| source_type | Invoice, timesheet, etc. |
| source_ref | Invoice/PO number |
| entered_by | FK to user |
| created_at | Timestamp |

---

### `change_orders`
Header record for approved changes.

| Field | Description |
|-------|-------------|
| id | UUIDv7 |
| unit_id | FK |
| description | Scope summary |
| status | `draft`, `submitted`, `approved`, `rejected` |
| requested_by | FK |
| approved_by | FK |
| approved_at | Timestamp |

---

### `change_order_lines`
Detailed line items tied to activities.

| Field | Description |
|-------|-------------|
| id | UUIDv7 |
| change_order_id | FK |
| activity_id | FK |
| vendor_id | Optional FK |
| quantity | Can be negative for scope reduction |
| unit_cost | Cost per unit |
| total_cost | Derived |

---

## Rules & Behaviors

- ✅ Budgets must be **fully approved** before release
- ✅ Actuals **cannot post** unless `unit.status = 'released'`
- ✅ Each cost line is **vendor-exclusive**
- ✅ Change orders:
  - Must be approved before actuals
  - Support **adds and removals**
  - Are **never merged into baseline**
- ✅ Actuals support:
  - Quantity + unit cost
  - Vendor override
  - Links to either `cost_lines` or `change_order_lines`

---

## Reporting

| Metric | Source |
|--------|--------|
| **Original Budget** | `cost_lines` (approved budget) |
| **Change Orders** | Sum of `change_order_lines.total_cost` |
| **Actual Costs** | Sum of `actual_costs.amount` |
| **Total Exposure** | Original Budget + COs |
| **Variance (Baseline)** | Budget – Actual |
| **Variance (Total)** | (Budget + COs) – Actual |

---

## Status Workflow

```text
projects → units → unit_budgets
                                     ↓
                           status = 'approved'
                                     ↓
                           units.status = 'released'
                                     ↓
                              actuals can begin
```

---

## Future Enhancements

- 🔄 Promote change orders to new budget versions
- 🔐 Role-based change order approval workflows
- 📊 Dashboard widgets for unit-level cost analysis

---