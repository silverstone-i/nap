# PRD 0000 — NAP Platform Architecture

**Status:** Accepted

**Date:** 2026-08-19

**Related:**

- [Project structure](../architecture/PROJECT-STRUCTURE.md)
- [ADR 0001 — API layering and module structure](../ADRs/0001-api-layering-and-module-structure.md)
- [ADR 0002 — Technology stack](../ADRs/0002-technology-stack.md)
- [ADR 0003 — Web toolchain](../ADRs/0003-web-toolchain-vite-and-bundler-mode-typescript.md)
- [ADR 0004 — Central admin, cells, and RLS tenant isolation](../ADRs/0004-central-admin-cells-and-rls-tenant-isolation.md)
- [RULES — Database access](../RULES/database-access.md)
- [RULES — Web shell](../RULES/web-shell.md)

## Overview

This PRD is the current source of truth for NAP's platform architecture. It
defines the requirements that every component, deployment, and client must
satisfy. ADRs explain why the requirements were selected; structure and RULES
documents define where and how they are implemented.

NAP is a horizontal, project-native, multi-entity ERP. It is delivered as a
modular-monolith API with independently deployable clients, a central
administration database, and one or more tenant cells. The React web
application is the first API client.

This is a cross-cutting platform PRD and therefore does not own a business
router or table. Component PRDs own functional APIs and physical table
definitions.

## Users and scenarios

### Tenant user

A person authenticates once, selects one of their authorized tenants, and uses
that tenant's business data without seeing its physical cell placement. Editing
a URL, token, or request body cannot grant tenant access or choose a database.

### Platform operator

An operator provisions and monitors cells, assigns tenants by operational
policy, manages controlled impersonation, and moves or dedicates a tenant
without exposing infrastructure details to clients.

### Module developer

A developer implements a component in the modular monolith, assigns every
table and router to one owner, targets the correct database, and receives the
same tenant-isolation guarantees in HTTP, worker, migration, and reporting
paths.

### Deployment operator

An operator deploys web and API releases independently, runs migrations against
explicit database targets, adds cells from the same build, and backs up or
restores a cell without coupling recovery to an application deployment.

### Self-hosted operator

An organization runs the same architecture using its own local admin database
and one or more local cells without a runtime dependency on NapSoft's managed
service.

## Data tables

This platform PRD owns database boundaries and invariants, not component table
columns. Table definitions become authoritative in their component PRDs and
module-owned migrations.

| Database boundary               | Physical schemas | Data ownership                                                                                                         |
| ------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Central administration database | `admin`          | Global identities, sessions, tenants, memberships, cell registry, tenant-to-cell assignment, and managed-service audit |
| Tenant cell database            | `cell`           | Cell-local tenant and membership projections used for enforcement                                                      |
| Tenant cell database            | `reference`      | Shared non-tenant reference data and application metadata                                                              |
| Tenant cell database            | `app`            | Shared tenant business tables protected by forced RLS                                                                  |
| Tenant cell database            | `reporting`      | Tenant-safe views over RLS-protected business tables                                                                   |

[NAP Initial Table Schema](../reference/NAP-Initial-Table-Schema.md) is the
non-authoritative inventory used to plan component PRDs. No implementation may
treat that reference as a substitute for an accepted component PRD and
migration.

## API

This PRD defines platform constraints rather than component endpoint paths.
Component PRDs own method/path tables and permission names. Every API route is
subject to the applicable `ARCH-*` requirements below.

API versions are owned per module. A module adding a new version does not force
other modules to change versions.

## Business rules

### ARCH-001 — API platform boundary

The NAP API is the application platform. Web, mobile, workers, and approved
integrations are clients of the same server-owned business rules and data
boundaries.

### ARCH-002 — Modular monolith

The API remains a modular monolith with statically registered modules. Adding
cells does not create microservices. A service split requires measured need and
an accepted superseding ADR.

### ARCH-003 — Independent release units

The web client and API remain in one monorepo but are independently buildable
and deployable. Database migrations are separate release operations.

### ARCH-004 — Separate databases from the first cell

Managed NAP begins with a central administration database and a separate Cell
1 database. They may share a PostgreSQL instance initially but retain
independent connection pools, migrations, backup, restore, movement, and
lifecycle.

### ARCH-005 — Central control-plane authority

The central administration database is authoritative for global identities,
sessions, tenant records and status, user-to-tenant membership, cell records,
tenant-to-cell assignment, and managed-service impersonation audit.

### ARCH-006 — No tenant business data in the control plane

Projects, invoices, vendors, accounting transactions, and other tenant
business records must not be stored in the central administration database.

### ARCH-007 — Stable client addresses

Cell identifiers, database hosts, and routing details are infrastructure
concerns. They must not appear in permanent customer URLs or client API
contracts.

### ARCH-008 — Secret ownership

Database credentials belong to deployment secret configuration. They must not
be stored in tenant or cell rows, returned to clients, or written to logs.

### ARCH-009 — Cell connectivity boundary

A cell API deployment may connect to the central administration database and
its own cell database. It must not receive credentials for or connect to an
unrelated cell database.

### ARCH-010 — Repeatable and recoverable cells

A cell is a repeatable deployment unit containing the API modular monolith, one
cell database, shared RLS-protected tables, enforcement projections, and
tenant-safe reporting. A cell is independently deployable and recoverable;
failure or maintenance in one cell must not make unrelated cells unavailable.

### ARCH-011 — Evidence-based cell placement

Cells are added or selected using measured capacity, isolation, regional, data
residency, recovery, or contractual requirements. New tenants may be placed in
a new cell without moving existing tenants.

### ARCH-012 — Controlled tenant movement

Moving a tenant requires a complete tenant-scoped copy, verification of data
and isolation, an authoritative central assignment change, and a controlled
recovery window. The client address does not change.

### ARCH-013 — Shared physical tables

A cell has one physical set of application tables. NAP must not create schemas
or tables per tenant. Module entitlement is enforced by the application and
does not create tenant-specific physical tables.

### ARCH-014 — Immutable tenant key

Every tenant-owned row has an immutable, non-null `tenant_id`, except the
cell-local tenant projection whose `id` is the tenant key.

### ARCH-015 — Tenant-inclusive relational integrity

Tenant tables expose a tenant-inclusive candidate key, and relationships
between tenant-owned rows use composite foreign keys containing `tenant_id`.
Tenant-specific natural-key constraints also include `tenant_id`.

### ARCH-016 — No cross-database foreign keys

Admin identifiers copied into a cell remain identifiers rather than
cross-database foreign keys. Controlled, revisioned workflows synchronize the
cell-local projections required for enforcement.

### ARCH-017 — Forced row-level security

Every tenant-owned table enables and forces PostgreSQL RLS for both reads and
writes. RLS and tenant-inclusive relational constraints are both required.

### ARCH-018 — Transaction-local tenant context

Every tenant operation runs inside a cell transaction that sets
`nap.tenant_id` with `SET LOCAL` before tenant queries. Tenant isolation must
not use `search_path`, a schema switch, or pooled session state.

### ARCH-019 — Least-privileged database roles

The application runtime role does not own tables and does not have
`SUPERUSER`, `BYPASSRLS`, or permission to disable tenant policies. Migration
and controlled administrative roles remain separate.

### ARCH-020 — Uniform non-HTTP isolation

Workers, reports, imports, batch operations, and tests use the same
tenant-scoped transaction mechanism as HTTP requests.

### ARCH-021 — Controlled cross-tenant administration

Cross-tenant administrative work uses an explicitly authorized role and
produces a complete audit record. Ordinary application roles cannot obtain a
cross-tenant view.

### ARCH-022 — Server-owned access resolution

The server resolves identity, session validity, tenant membership, cell
assignment, entitlements, roles, permissions, and resource access. A
client-supplied tenant ID or cell value expresses intent only and cannot select
a database or grant access.

### ARCH-023 — Authoritative routing and authorization data

PostgreSQL is authoritative for tenant-to-cell assignment and authorization
state. Redis, JWT claims, and client caches must not independently grant access
or override current database state.

### ARCH-024 — Explicit database handles

An API deployment creates explicit, independently typed and independently
closable admin and cell database handles. Repositories, migrations, bootstrap,
audit context, and lifecycle remain bound to the owning handle.

### ARCH-025 — Explicit migration targets

Admin migrations run once per admin database and cell migrations run once per
cell database. Migrations never run once per tenant and never run implicitly on
every application startup.

### ARCH-026 — Compatible database evolution

Production schema changes use expand-and-contract sequencing so compatible API
and client versions can overlap during deployment.

### ARCH-027 — Compatible API evolution

The API contract is a product boundary. Changes remain compatible across the
supported deployment window so the API can be deployed before clients that use
new behavior.

### ARCH-028 — Controlled tenant provisioning

A tenant remains pending until central records, the cell-local tenant
projection, initial configuration, membership projections, and negative RLS
verification succeed. Partial failure remains recoverable and must not activate
the tenant.

### ARCH-029 — Redis is optional acceleration

Redis may cache derived routing or authorization data for performance or
coordination. Cache misses, eviction, restart, and outage retain a correct
PostgreSQL-backed path. Redis is never the sole copy of security state.

### ARCH-030 — Object storage boundary

Binary documents belong in object storage. PostgreSQL stores their metadata,
tenant ownership, integrity information, and access-control references.

### ARCH-031 — Workers are justified deployment units

A worker deployment is added only when background workload or operational
isolation justifies it. Workers reuse API domain modules and the tenant
transaction boundary rather than implementing a second business layer.

### ARCH-032 — Immutable audit and financial history

Security audit, impersonation, approval, and posted financial records are
append-only where designated by their component PRDs. Corrections use reversal
or superseding records.

### ARCH-033 — Negative isolation verification

Every tenant-aware component includes negative tests that deliberately attempt
cross-tenant reads, inserts, updates, deletes, and foreign-key references.

### ARCH-034 — Dedicated managed cells

A managed tenant may receive dedicated cell infrastructure while continuing to
use the central managed administration service. Dedicated placement changes
configuration and operations, not the domain model.

### ARCH-035 — Fully isolated self-hosting

A self-hosted installation uses the same architecture with its own local admin
database and one or more local cells and has no runtime dependency on
NapSoft's central service.

### ARCH-036 — Database recovery independence

PostgreSQL is managed separately from application deployments. Database
recovery must not depend on packaging, redeploying, or rolling back an API
container.

### ARCH-037 — Tenant-safe reporting

Reporting preserves the caller's tenant boundary. Views and future reporting
infrastructure must not execute with privileges that bypass base-table RLS or
combine tenants without controlled administrative authorization.

### ARCH-038 — Additive growth test

Adding a client, tenant, module, worker, dedicated deployment, or cell must not
weaken the central identity boundary, cell connectivity boundary, or tenant RLS
boundary.

## Out of scope

- Component-specific workflows, tables, routes, permissions, and status
  transitions belong in component PRDs.
- Exact indexes, checks, and migration SQL belong in module-owned migrations.
- Capacity thresholds and automated placement algorithms require operational
  evidence and a later ADR.
- Automated tenant movement requires a dedicated PRD after multiple cells
  exist.
- Materialized reporting requires a tenant-safe refresh and access design.
- Microservice decomposition is not part of the initial platform.
- OpenAPI generation is intentionally excluded.

## Success criteria

| Requirements                                               | Observable proof                                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ARCH-001`–`ARCH-003`, `ARCH-027`                          | Web and API build and deploy independently; supported client and API versions interoperate                                                                    |
| `ARCH-004`–`ARCH-010`, `ARCH-024`, `ARCH-036`              | Admin and cell handles target distinct databases; each can migrate, close, back up, restore, and move without operating on the other                          |
| `ARCH-011`, `ARCH-012`, `ARCH-028`, `ARCH-034`, `ARCH-035` | Provisioning, placement, movement, dedicated-cell, and self-hosted acceptance tests preserve stable client addressing and recoverable state                   |
| `ARCH-013`–`ARCH-021`, `ARCH-033`, `ARCH-037`              | Automated negative tests fail every attempted cross-tenant read, write, delete, relationship, and reporting path even when application predicates are omitted |
| `ARCH-022`, `ARCH-023`, `ARCH-029`                         | Membership revocation, stale tokens, cache eviction, and Redis outage cannot increase access and retain a database-backed decision path                       |
| `ARCH-025`, `ARCH-026`                                     | Release tests prove migrations run against explicit targets and permit the supported old/new application overlap                                              |
| `ARCH-030`–`ARCH-032`                                      | Binary storage, worker execution, and immutable history follow their component contracts without bypassing tenant or audit boundaries                         |
| `ARCH-038`                                                 | Architecture tests for each new client, module, worker, tenant, or cell show no additional database reach or isolation privilege                              |

## Revisions

- **2026-08-19:** Established PRD 0000 as the current platform architecture
  source of truth and incorporated the final-design, do/don't, deployment, and
  tenant-isolation requirements previously held in planning discussion output.
