# nap-serv: Schema Refactoring Plan

This document outlines how to adapt or remove existing schemas in the nap-serv project to align with the new project-unit-based budgeting and actuals architecture.

---

## ✅ Schemas to KEEP

### `clientsSchema.js`
- **Status**: Keep
- **Usage**: Still linked to `projects` as owner/customer.
- **Suggestion**: Add `is_active`, `contact_id`, `default_terms` if useful for future AR.

### `costLinesSchema.js`
- **Status**: Keep (Core)
- **Usage**: Central to budgeting logic, scoped by `project_unit_budget_id`.
- **Ensure**:
  - Fields: `activity_id`, `vendor_id`, `quantity`, `unit_cost`, `total_cost`
  - Optional: `description`, `unit`, `is_locked`

---

## ❌ Schemas to REMOVE or DEPRECATE

### `activity_budgets`
- **Why**: Superseded by `cost_lines` linked to `project_unit_budgets`
- **Action**: Remove

### `activity_actuals`
- **Why**: Replaced by `actual_costs` (linked to cost_lines or change_order_lines)
- **Action**: Remove

### `project_budgets` / `project_actuals`
- **Why**: Budgeting is per-unit now, not per-project
- **Action**: Remove

### `projectActivitiesSchema.js`
- **Why**: Redundant; activity usage is inferred from `cost_lines`
- **Action**: Remove unless used for scheduling (then rename to `scheduled_activities`)

---

## 🔄 Schemas to REFACTOR

### `projectsSchema.js`
- **Add**:
  - `status`: enum (`planning`, `budgeted`, `released`, etc.)
- **Clean Up**:
  - Assumptions about single-layer budgets

### `activitiesSchema.js` and `categoriesSchema.js`
- **Status**: Keep (Tenant-defined)
- **Ensure**:
  - Proper FK relationships
  - Stable identifiers across units and budgets

### `activityProfitabilityViewSchema.js`
- **Status**: Refactor
- **Action**:
  - Replace `activity_budgets` / `activity_actuals` with `cost_lines` / `actual_costs`
  - Optional: Rename to `unitActivityProfitabilityView`
  - Consider making it a materialized view for performance

---

## 🔜 New Schemas Introduced

- `project_unitsSchema.js`
- `project_unit_budgetsSchema.js`
- `actual_costsSchema.js`
- `change_ordersSchema.js`
- `change_order_linesSchema.js`

These will be defined as part of the new costing and actual tracking framework.

---