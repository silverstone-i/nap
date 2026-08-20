# 0004 — Central administration, tenant cells, and RLS isolation

- **Status:** Accepted
- **Date:** 2026-08-19
- **Supersedes:** The database-scope clauses of
  [ADR 0001](0001-api-layering-and-module-structure.md); its layer order, flat
  modules, and module-internal shape remain accepted.
- **Requirements:** `ARCH-004`–`ARCH-025`, `ARCH-028`, `ARCH-033`–`ARCH-038`

## Context

The original module descriptor distinguished an `admin` schema from a tenant
schema and anticipated schema-per-tenant isolation. That design makes every
tenant a migration target, makes pooled schema state a security concern, and
does not provide an operational boundary for regional, dedicated, or
capacity-based placement.

NAP also needs one global managed-service identity to access more than one
tenant while ensuring a cell cannot reach another cell's business data. These
requirements need separate control-plane and tenant-data boundaries rather
than additional schemas inside one global database.

## Decision

### Database topology

- Use one central administration database and one database per tenant cell.
- The admin and first cell databases exist separately from the first release,
  even when hosted by the same PostgreSQL instance.
- The central database owns identity, session, tenant, membership, cell, and
  tenant-to-cell records.
- A cell database owns shared business tables for every tenant assigned to
  that cell.
- A cell deployment receives central credentials and credentials for its own
  cell only.

### Tenant isolation

- Use one physical business schema per cell, not per tenant.
- Put an immutable, non-null `tenant_id` on every tenant-owned row, with the
  documented cell-tenant projection exception.
- Enable and force RLS on tenant-owned tables.
- Use tenant-inclusive candidate keys and composite foreign keys.
- Set `nap.tenant_id` with `SET LOCAL` inside the transaction performing tenant
  work.
- Do not use `search_path`, schema switching, or pooled session state as a
  tenant boundary.
- Use a runtime role that neither owns tables nor bypasses RLS.

### Cross-database coordination

- Do not create cross-database foreign keys.
- Synchronize the minimum tenant and membership projections needed for local
  enforcement through revisioned, retryable workflows.
- Keep a tenant pending until its cell projection, seed configuration, and
  isolation verification succeed.
- Treat tenant movement as a controlled copy, verification, cutover, and
  recovery workflow.

### Database access

- Use the `pg-schemata` database factory to create explicit admin and cell
  handles with independent repositories, migrations, and lifecycle.
- Bind migrations, bootstrap, and audit context to the owning handle.
- Run admin migrations once per admin database and cell migrations once per
  cell database as explicit release operations.

### Module descriptors

Replace ADR 0001's former tenant-schema scope with:

- `databaseTarget`: `admin`, `cell`, or `none`;
- physical `schema`: `admin`, `cell`, `reference`, `app`, `reporting`, or none;
- `licensable`: request-time entitlement metadata, not physical installation.

All cell modules migrate to the shared cell schema. Tenant entitlement gates
their use rather than their tables' existence.

## Consequences

- Adding a tenant creates data and configuration, not schemas or migration
  targets.
- Adding a cell creates an operational database/deployment boundary while
  reusing the same application build and migration set.
- RLS prevents row visibility/write errors; composite keys separately prevent
  cross-tenant relationships.
- Provisioning and membership changes cross databases and therefore require
  idempotent workflows rather than distributed transactions.
- Cell-local projections can be temporarily stale, so revisions and activation
  gates are explicit.
- Dedicated managed cells and self-hosted installations reuse the same model.
- Negative database tests become release gates for every tenant-aware module.

## Alternatives considered

**Schema per tenant.** Rejected. Migration count, schema switching, pooled
state, and operational movement scale with tenant count and weaken the desired
cell boundary.

**Database per tenant.** Rejected as the default. It creates unnecessary pool,
migration, backup, and operational overhead. Dedicated tenants can still
receive a cell containing one tenant.

**One shared database with no cells.** Rejected. It cannot provide the desired
regional, capacity, dedicated-hosting, recovery, and blast-radius boundaries.

**Application predicates without RLS.** Rejected. A missing predicate would
become a cross-tenant disclosure. RLS remains mandatory defense in depth.

**Microservice per cell or module.** Rejected. Cells are repeatable deployment
instances of the modular monolith, not new code-service boundaries.
