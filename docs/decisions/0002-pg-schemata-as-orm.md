# 0002. pg-schemata as ORM over Knex/Drizzle/Prisma

**Date:** 2025-02-17
**Status:** accepted
**Author:** NapSoft

## Context

NAP requires a data access layer that supports schema-per-tenant isolation, schema-driven DDL generation, built-in migration management, and tight integration with PostgreSQL-specific features (partial indexes, advisory locks, pgvector). Third-party ORMs and query builders each impose their own schema definition format and migration tooling, which may not align with the multi-schema tenancy model. NapSoft owns the pg-schemata library and can extend it as requirements evolve.

## Decision

Use pg-schemata as the sole ORM/query layer. It provides:

- **`TableModel`** — writable CRUD with soft deletes, audit fields (`created_by`, `updated_by`, timestamps), Zod validation auto-generation, and Excel import/export
- **`QueryModel`** — read-only access for SQL views
- **`MigrationManager`** — SHA-256 checksummed migrations with PostgreSQL advisory locks and per-schema discovery
- **`bootstrap()`** — atomic schema creation (all tables in a single transaction)
- **Schema definitions** as plain JavaScript objects — the single source of truth for both DDL and runtime column sets
- Keyset pagination via `findAfterCursor()`, aggregate query helpers (`SUM`, `AVG`), and a raw SQL escape hatch for complex queries
- Pre/post hooks for cross-cutting concerns (e.g., GL posting after invoice approval)

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| Knex.js | Mature query builder; large ecosystem; flexible migrations | No schema-driven DDL; migrations are imperative scripts; no built-in multi-schema support; no soft delete or audit field conventions |
| Drizzle ORM | Type-safe; lightweight; Postgres-native | Newer ecosystem; schema definition tied to TypeScript; multi-schema tenancy requires manual wiring; no owned control over library |
| Prisma | Excellent DX; auto-generated client; strong typing | Schema file (`schema.prisma`) is a separate DSL; multi-schema tenancy not natively supported; connection pool per-schema is expensive; no owned control |

## Consequences

**Positive:**
- Full ownership — features (aggregate helpers, batch schema ops, connection tagging) are added on NapSoft's schedule, not waiting on upstream PRs
- Postgres-first design — no abstraction leaks from supporting multiple databases
- Schema definitions are the single source of truth for DDL, column sets, validation, and import/export
- Built-in conventions (soft deletes, audit fields, keyset pagination) enforce consistency across all modules

**Negative:**
- Owned dependency means NapSoft bears all maintenance and documentation burden
- Smaller community — no Stack Overflow answers or third-party plugins
- New team members must learn pg-schemata's API rather than a widely-known ORM
