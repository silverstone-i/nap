# 0001. Schema-per-Tenant Isolation over Row-Level Tenancy

**Date:** 2025-02-17
**Status:** accepted
**Author:** NapSoft

## Context

NAP is a multi-tenant ERP platform serving multiple customer organizations from a single deployment. Each tenant's financial, procurement, and operational data must be completely isolated from other tenants. The two dominant approaches for multi-tenant data isolation in PostgreSQL are:

1. **Row-level tenancy** — all tenants share tables; a `tenant_id` column discriminates rows; queries must always include a tenant filter.
2. **Schema-per-tenant** — each tenant gets a dedicated PostgreSQL schema containing a full copy of all business tables.

The system also requires independent migration rollouts per tenant (for staggered upgrades) and the ability to drop or export a single tenant's data without touching others. Cross-tenant data leakage in a financial application is a critical risk that must be structurally prevented, not just conventionally avoided.

## Decision

Each tenant is provisioned a dedicated PostgreSQL schema (e.g., `acme`, `globex`). System-wide tables (`tenants`, `nap_users`, `nap_user_addresses`, `match_review_logs`) live in a separate `admin` schema. Tenant resolution happens per-request via the `x-tenant-code` header, and pg-schemata's `setSchemaName()` binds all subsequent queries to that schema. The `bootstrap()` function creates a new tenant schema and all its tables in a single transaction. `MigrationManager` applies pending migrations independently per schema.

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| Row-level tenancy (`tenant_id` column) | Single set of tables; simpler migrations; lower per-tenant overhead | Every query must include `WHERE tenant_id = ?`; one missed filter leaks data; shared indexes grow with all tenants; cannot independently migrate or export a single tenant |
| Database-per-tenant | Strongest isolation; independent backups | Connection pool explosion; cross-tenant admin queries require multi-database joins; significant operational overhead |

## Consequences

**Positive:**
- Complete data isolation — queries physically cannot touch another tenant's schema, eliminating cross-tenant leakage by construction
- Independent schema migrations — tenants can be upgraded on different schedules
- Clean tenant export/drop — `pg_dump` or `DROP SCHEMA CASCADE` operates on a single tenant without affecting others
- No `WHERE tenant_id = ?` discipline required — developers cannot accidentally forget a filter because the query runs in the scoped schema

**Negative:**
- Schema proliferation — each tenant adds a full set of tables; DDL changes must be applied N times (mitigated by `MigrationManager` iterating over all schemas)
- Cross-tenant reporting requires explicit `admin` schema joins or aggregation across schemas
- Connection pool is shared but search_path must be set per-request, adding a small per-query overhead
