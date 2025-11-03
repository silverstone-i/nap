# Domain Model & Business Rules

This document captures the functional flows that drive budgeting, costing, accounting, and related
modules within `nap-serv`. Use it to understand how tables relate to each other and which invariants
the code is expected to enforce.

---

## Project Hierarchy

```text
projects
  └─ units
       └─ unit_budgets (versioned)
            └─ activities
                 └─ cost_lines
                      └─ actual_costs
                      └─ change_order_lines
```

- **Projects** – top-level jobs with links to clients, addresses, and companies.
- **Units** – repeatable deliverables (e.g., a house plan) under a project.
- **Unit Budgets** – versioned baseline budgets per unit. Status: `draft` → `submitted` → `approved`.
- **Activities** – categorical buckets (labour, material, subcontract) tied to cost codes.
- **Cost Lines** – planned spend per activity/vendor combination. Store quantity, unit cost, totals.
- **Actual Costs** – realised spend that references cost lines or change orders.
- **Change Orders** – approved scope adjustments; each has its own line items and workflow.

IDs are UUIDv7, generated server-side. All tenant tables include `tenant_id`/`tenant_code`.

---

## Budgeting Rules

- Budgets must be **approved** before units can be marked `released`.
- Once a budget version is approved, it becomes read-only; new changes spawn another version.
- `unit_budgets` track `status`, `approved_by`, `approved_at`, and optional notes.
- `cost_lines.total_cost` should equal `quantity * unit_cost`; store derived value for reporting.
- Standard fields:
  - `remaining_budget` and `spent_to_date` for quick lookups (updated by triggers/services).
  - `source_type` tags identify where a budget originated (manual, import, template).

---

## Change Orders

- Workflow: `draft` → `submitted` → `approved`/`rejected`.
- Each `change_order_line` must reference its base `cost_line_id` when modifying an existing scope.
- When approved, change orders adjust remaining budget and variance metrics.
- Negative quantities/costs are allowed to represent scope reductions.
- Posting change orders fires the same GL hooks as baseline budgets, with explicit references.

---

## Actual Costs

- Created by project managers, AP invoice imports, or integrations.
- Default state: `pending`. Promotion to `approved` is subject to budget/tolerance checks.
- Validation checklist:
  - Unit must be `released`.
  - Associated cost line must exist and be approved.
  - Amounts cannot push totals beyond approved budget plus tolerance unless change orders cover it.
- Fields:
  - `quantity`, `unit_cost`, `amount`, `date_incurred`
  - `source_type` (`invoice`, `timesheet`, `import`, ...)
  - `source_ref` for traceability (invoice number, etc.)
- Approval triggers GL posting (debit expense/WIP, credit AP or accrual).

---

## Accounts Payable & Receivable

### AP
- Invoices follow `draft` → `approved` → `posted` states.
- Posting requires every line to map to a valid GL account and optionally a cost line.
- Posting updates vendor balances and creates GL entries (AP Liability ↔ Expense/WIP).
- Credit memos track vendor-issued adjustments and may net against outstanding invoices.

### AR
- Supports manual or templated invoice creation.
- Revenue recognition can depend on activity completion percentage or cost thresholds.
- Posting debits AR, credits revenue; payments reverse the entry.
- Partial payments and retainage are part of the roadmap but not fully implemented yet.

---

## General Ledger & Intercompany

- Journal entries record all financial movements with `project_id`, `company_id`, `account_id`, and
  optional links (`cost_line_id`, `change_order_line_id`, `invoice_id`).
- Entries must balance (sum debits = sum credits) and fall within open fiscal periods.
- Intercompany transactions create paired journal entries (due-to / due-from) and carry elimination
  flags for consolidated reporting.
- Consolidation phase targets tenant-level P&L, balance sheet, and elimination reports.

---

## Reporting Metrics

| Metric                  | Source                                             |
|-------------------------|----------------------------------------------------|
| Original Budget         | Sum of approved `cost_lines.total_cost`             |
| Change Orders           | Sum of approved `change_order_lines.total_cost`     |
| Actual Costs            | Sum of `actual_costs.amount` (approved state)       |
| Total Exposure          | `Original Budget + Change Orders`                   |
| Variance (Baseline)     | `Original Budget - Actual Costs`                    |
| Variance (Total)        | `Total Exposure - Actual Costs`                     |

Views under `modules/views/sql` precompute profitability metrics for dashboards.

---

## SKU & Vendor Matching (BOM)

- The BOM module manages catalog SKUs, vendor matches, and onboarding workflows.
- Matching logic uses Levenshtein distance plus curated metadata; results store confidence scores.
- Vendor onboarding workflows integrate with RBAC to restrict who can approve catalog links.

---

## Future Enhancements

- Promote approved change orders into new baseline budget versions.
- Enforce scheduling windows for when costs can be logged.
- Surface budget vs actual dashboards per project, unit, and activity.
- Expand automated journal posting for AP/AR and intercompany flows.
- Introduce multi-currency and tax support.

---

## Related Documents

- [`architecture.md`](./architecture.md) – system-wide view of modules and runtime components
- [`auth-rbac.md`](./auth-rbac.md) – authentication, JWT lifecycle, RBAC policy model
- [`developer-guide.md`](./developer-guide.md) – coding standards, API conventions, testing practices
