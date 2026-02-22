/**
 * @file ADR-0001: Schema-per-tenant isolation
 * @module docs/decisions
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

# ADR-0001: Schema-per-Tenant Isolation

## Status

Accepted

## Context

NAP is a multi-tenant construction ERP handling sensitive financial data
(AP/AR invoices, journal entries, budgets) for multiple independent tenants.
We need a tenancy strategy that provides strong data isolation while keeping
operational complexity manageable.

Common approaches:

| Strategy | Isolation | Complexity | Migration effort |
|---|---|---|---|
| Row-level (tenant_id FK) | Low — every query must filter | Low | Low |
| Schema-per-tenant | High — PG schemas act as namespaces | Medium | Medium |
| Database-per-tenant | Highest | High | High |

## Decision

Use **PostgreSQL schema-per-tenant** isolation. Each tenant gets its own PG
schema (e.g., `nap`, `acme_construction`) containing identical table
structures. A shared `admin` schema holds cross-tenant tables (`tenants`,
`nap_users`, `impersonation_logs`, `match_review_logs`).

## Consequences

### Positive

- Strong isolation — a query in one schema cannot accidentally read another
  tenant's data without an explicit `SET search_path` or schema-qualified name.
- pg-schemata's `bootstrap()` and `MigrationManager` natively support
  schema-per-tenant: models bind to a schema at instantiation time.
- Tenant provisioning is a `CREATE SCHEMA` + migration run — no row seeding
  or partition management.
- Individual tenant schemas can be backed up or restored independently.

### Negative

- Migrations must iterate all tenant schemas — the `migrateTenants` script
  handles this with advisory locks to prevent concurrent runs.
- Cross-tenant reporting requires explicit schema joins or an aggregation
  layer (NapSoft super-users use `x-tenant-code` header to switch context).
- Schema count grows linearly with tenants; hundreds of schemas are fine for
  PG but thousands may need connection pooling tuning.

### Mitigations

- Advisory-lock-guarded migration runner prevents partial applies.
- Checksum validation detects modified migrations.
- `createCallDb` proxy auto-binds models to `req.tenantSchema` per request.
