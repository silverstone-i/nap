# Phase II Activities Module – Context Summary

## 🧱 General Architecture

- **Stack**: PERN (PostgreSQL, Express, React, Node.js)
- **ORM**: `pg-schemata` (schema-driven)
- **IDs**: `gen_random_uuid()` used as PK in all tables
- **Multitenancy**: `tenant_id` field in all tables (6–8 char, e.g., AST, WEG, PRU)

---

## 📦 Modules and Tables

### 🔧 Activities Module

- **`categories`** – Cost groupings
- **`activities`** – Tasks tied to categories
- **`cost_lines`** – Turnkey or assembly cost entries per activity
- **`activity_budgets`** – Estimated cost/hours/price per activity
- **`activity_actuals`** – Actual logged costs (labor, material, subcontract)
- **Views**:
  - `activity_profitability_view.sql`
  - `project_actuals_profitability_view.sql`

### 🏗 Project Management

- **`projects`** – Parent of activities, includes FK to `clients`, `addresses`
- **Views**:
  - `project_profitability_view.sql`
  - `project_actuals_profitability_view.sql`

### 🧾 Accounting Module

- **`clients`** – Contact, tax, billing info (owned by accounting)

### 🏠 Shared Entities

- **`addresses`** – Reused by vendors, clients, projects
- **`contacts`** – Assigned to vendors, clients, internal reps

---

## ✅ Next Steps for Phase II Completion

- Scaffold repositories, controllers, APIs for:
  - `projects`, `activity_budgets`, `activity_actuals`, `clients`
- Implement profitability views in controller logic
- Write unit + integration tests

---

Ready to pick up this context in the next session.
