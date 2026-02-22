/**
 * @file ADR-0002: pg-schemata over Knex / Drizzle
 * @module docs/decisions
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

# ADR-0002: pg-schemata over Knex / Drizzle

## Status

Accepted

## Context

We need a database layer that supports schema-per-tenant isolation, DDL
generation from JS schema definitions, a migration framework with checksums,
and model instantiation bound to a runtime schema. Options evaluated:

| Library | Schema-aware | Migration checksums | Model binding | Maturity |
|---|---|---|---|---|
| Knex | Manual search_path | No | No | High |
| Drizzle | Limited | No | No | Medium |
| pg-schemata | Native | Yes | Yes | Internal |

## Decision

Use **pg-schemata ^1.3.0**, our internal library built on top of pg-promise.
It provides:

- `defineTable` / `defineQuery` — declarative schema definitions that
  generate DDL (CREATE TABLE, indexes, constraints) and pg-promise ColumnSets.
- `TableModel` / `QueryModel` — CRUD + query helpers that bind to a schema
  at construction time via `new Model(db, schema)`.
- `bootstrap(db, schema, tables)` — creates schema + all tables + indexes
  in dependency order.
- `MigrationManager` — checksummed migrations with advisory locks and a
  `pgschemata.migrations` history table.
- Auto-generated Zod validators from column definitions.

## Consequences

### Positive

- Single source of truth for table structure — DDL, insert defaults, Zod
  validation, and ColumnSet all derived from the same schema definition.
- Schema binding is first-class: `createCallDb` instantiates models against
  the request's tenant schema with zero boilerplate.
- Checksum-validated migrations prevent silent drift between environments.

### Negative

- pg-schemata is an internal library — no community ecosystem or Stack
  Overflow answers. All debugging is internal.
- Schema defaults use JS values (`default: 'active'`), not SQL literals.
  Getting this wrong causes insert failures (documented in CLAUDE.md).
- `model.update(id, dto)` resets all ColumnSet columns to defaults for
  omitted fields — partial updates require raw SQL.

### Mitigations

- Conventions documented in CLAUDE.md and enforced by code review.
- Comprehensive migration tests (idempotency, checksums, advisory locks)
  run in CI against `nap_test`.
