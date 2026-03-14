# Reports Module Rules

## Overview

The reports module provides read-only (GET) endpoints backed by tenant-scoped SQL views. All queries filter `deactivated_at IS NULL` by default. No mutations are supported.

## SQL Views

| View | Key Aggregations |
|------|-----------------|
| `vw_project_profitability` | Invoiced/collected revenue, committed cost, cash out, actual spend, gross profit, gross margin %, net cashflow, budget variance, estimated cost at completion, projected profit/margin |
| `vw_project_cashflow_monthly` | Monthly inflow (receipts), outflow (payments), actual cost, net cashflow, cumulative running totals via window functions |
| `vw_project_cost_by_category` | Budgeted vs actual cost per activity category per project |
| `vw_ar_aging` | AR aging buckets (current, 1–30, 31–60, 61–90, 90+) per client; balance = total − receipts |
| `vw_ap_aging` | AP aging buckets per vendor; balance = total − payments − applied credit memos |

Export views (`vw_export_contacts`, `vw_export_addresses`, `vw_export_template_cost_items`, `vw_template_tasks_export`) provide polymorphic data export with source entity metadata.

## Calculation Rules

### Profitability

- **Gross profit** = invoiced revenue − committed cost
- **Gross margin %** = (gross profit / invoiced revenue) × 100 (zero-safe)
- **Net cashflow** = collected revenue − cash out
- **Budget variance** = total budgeted cost − actual spend
- **Est. cost at completion** = actual spend + MAX(0, budgeted − actual)
- **Projected profit** = contract amount − estimated cost at completion
- **Projected margin %** = (projected profit / contract amount) × 100 (zero-safe)

### Aging Buckets

Buckets are calculated from `CURRENT_DATE − due_date`:

| Bucket | Days Overdue |
|--------|-------------|
| Current | ≤ 0 |
| 1–30 | 1–30 |
| 31–60 | 31–60 |
| 61–90 | 61–90 |
| Over 90 | > 90 |

AP aging balance = `total_amount − SUM(payments) − SUM(applied credit memos)`. AR aging balance = `total_amount − SUM(receipts)`. Only invoices with non-zero remaining balance are included. AR aging additionally filters `status IN ('sent', 'open')`; AP aging filters `status IN ('open', 'approved')`.

### Cashflow Forecast

- **Expected inflows**: sent AR invoices with `due_date ≥ CURRENT_DATE` and remaining balance > 0
- **Expected outflows**: approved AP invoices with `due_date ≥ CURRENT_DATE` and remaining balance > 0
- **Monthly burn rate**: 90-day rolling average of approved actual costs, extrapolated as (SUM / days × 30)

## API Routes

All report routes are mounted under `/api/reports/v1/`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/reports/v1/ping` | GET | Health check |
| `/api/reports/v1/project-profitability` | GET | All projects profitability |
| `/api/reports/v1/project-profitability/:projectId` | GET | Single project profitability |
| `/api/reports/v1/project-cashflow/:projectId` | GET | Monthly cashflow for project |
| `/api/reports/v1/project-cashflow/:projectId/forecast` | GET | 6-month forward forecast |
| `/api/reports/v1/company-cashflow` | GET | Company-wide monthly cashflow |
| `/api/reports/v1/project-cost-breakdown/:projectId` | GET | Budget vs actual by category |
| `/api/reports/v1/ar-aging` | GET | All clients AR aging |
| `/api/reports/v1/ar-aging/:clientId` | GET | Single client AR aging |
| `/api/reports/v1/ap-aging` | GET | All vendors AP aging |
| `/api/reports/v1/ap-aging/:vendorId` | GET | Single vendor AP aging |
| `/api/reports/v1/margin-analysis` | GET | All projects sorted by margin (sortable via `sortBy` / `sortDir` query params) |
