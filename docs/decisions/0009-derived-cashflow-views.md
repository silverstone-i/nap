# 0009. Derived Cashflow Views over Dedicated Cashflow Tables

**Date:** 2025-02-17
**Status:** accepted
**Author:** NapSoft

## Context

NAP provides project profitability and cashflow reporting by linking AR invoices (revenue), AP invoices (costs), actual costs, and journal entries back to projects via `project_id` foreign keys. The reporting layer needs to present rolled-up metrics (revenue, costs, gross profit, margin %, net cashflow), monthly time series, cost breakdowns, and aging reports. The question is whether this reporting data should be computed on-the-fly from existing transactional tables or materialized into dedicated cashflow/profitability tables.

## Decision

Cashflow and profitability data is derived from existing transactional tables using PostgreSQL SQL views created at tenant provisioning and updated via migrations:

- **`vw_project_profitability`** — rolled-up metrics: revenue (AR), costs (AP + actual costs), gross profit, margin %, net cashflow per project
- **`vw_project_cashflow_monthly`** — monthly inflow/outflow time series per project
- **`vw_project_cost_by_category`** — cost breakdown by activity category
- **`vw_ar_aging`** — accounts receivable aging by client
- **`vw_ap_aging`** — accounts payable aging by vendor

The formula is: `PROJECT PROFITABILITY = Revenue (AR) - Costs (AP + Actual Costs)`.

Report endpoints (`/api/reports/v1/project-profitability`, `/api/reports/v1/project-cashflow/:projectId`, etc.) query these views directly using `QueryModel`.

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| Dedicated cashflow tables (materialized separately) | Pre-computed for fast reads; can add indexes optimized for reporting | Data synchronization burden — must update cashflow tables on every AR/AP/cost mutation; eventual inconsistency risk if sync fails; dual-write complexity; storage duplication |
| Materialized views with periodic refresh | Faster reads than plain views; no sync logic needed | Stale data between refreshes; `REFRESH MATERIALIZED VIEW` locks the view; refresh scheduling adds operational complexity |

## Consequences

**Positive:**
- Single source of truth — views always reflect the current state of transactional data with no sync lag
- No data synchronization logic — eliminates an entire class of dual-write bugs
- Real-time accuracy — reports are always current as of the query moment
- Simpler schema — no additional tables to migrate, back-fill, or maintain

**Negative:**
- Query performance depends on the size of underlying transactional tables — mitigated by indexes on `project_id` and date columns
- Complex view definitions may be harder to optimize than pre-computed tables
- High-frequency dashboard polling could create database load — mitigated by client-side caching and reasonable refresh intervals
