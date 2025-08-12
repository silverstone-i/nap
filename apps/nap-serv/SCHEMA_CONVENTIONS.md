

# nap-serv Schema Conventions

This document defines how database schemas should be designed and managed in nap-serv. These conventions apply across all tenant schemas and shared tables to ensure consistency, maintainability, and performance.

---

## Table Naming

- Use **plural snake_case** for table names:
  - ✅ `projects`, `vendor_prices`, `sku_matches`
- Avoid prefixes unless needed for shared tables (e.g. `global_`).

---

## Column Naming

- Use **snake_case** for all columns.
- Include type hints where relevant:
  - `*_id` for foreign keys
  - `*_at` for timestamps
  - `*_count`, `*_flag`, `*_status` for booleans or state
- Common fields:
  - `id UUID PRIMARY KEY DEFAULT uuidv7()`
  - `created_at TIMESTAMP DEFAULT now()`
  - `updated_at TIMESTAMP DEFAULT now()`
  - `deleted_at TIMESTAMP NULL` (for soft deletes)
- Use `notNull: true` for required fields.
- Mark immutable IDs and add custom properties when needed (e.g. `colProps: { cnd: true }`).
- Example:
  ```js
  { name: 'vendor_sku', type: 'varchar(64)', notNull: true }
  { name: 'confidence', type: 'float', notNull: false, default: 0.0 }
  ```

---

## Foreign Keys

- Always define foreign key constraints with `onDelete` behavior.
- Use `*_id` convention for referenced columns.
- Include both required and nullable relationships explicitly.
- Example:
  ```js
  {
    columns: ['vendor_id'],
    references: { table: 'vendors', columns: ['id'] },
    onDelete: 'RESTRICT'
  },
  {
    columns: ['catalog_sku_id'],
    references: { table: 'catalog_skus', columns: ['id'] },
    onDelete: 'SET NULL'
  }
  ```

---

## Constraints

- Each table must define the following in its `constraints` object:
  - `primaryKey`: required; usually `['id']`
  - `foreignKeys`: required for relational references; must define `onDelete`
  - `unique`: define for multi-column uniqueness (e.g. composite keys)
  - `indexes`: define performance-oriented indexes separately from constraints

- Example constraint block:
  ```js
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['vendor_id'],
        references: { table: 'vendors', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['catalog_sku_id'],
        references: { table: 'catalog_skus', columns: ['id'] },
        onDelete: 'SET NULL',
      },
    ],
    unique: [['vendor_id', 'vendor_sku']],
    indexes: [
      { type: 'Index', columns: ['vendor_id'] },
      { type: 'Index', columns: ['vendor_sku'] },
    ],
  }
  ```

- Avoid defining redundant indexes that are covered by `unique` or `primaryKey`.
- Always define composite unique constraints as arrays (e.g. `[['a', 'b']]`).

## Soft Deletes

- Use `deleted_at TIMESTAMP` field when `softDelete: true`.
- Avoid using boolean flags for deletion state.
- Add partial indexes for filtered queries:
  ```sql
  CREATE INDEX ON vendor_skus(vendor_id) WHERE deleted_at IS NULL;
  ```

---

## Indexing

- Index all foreign key columns and frequently queried fields.
- Use compound indexes when filters use multiple fields.
- Example:
  ```js
  { type: 'Index', columns: ['vendor_id'] },
  { type: 'Index', columns: ['vendor_sku'] }
  ```

---

## Schema Management

- Use `pg-schemata` to define schemas in JavaScript modules.
- Each table exports a `TableSchema` object with:
  - `dbSchema`, `table`, `version`
  - `columns`, `constraints`, and `indexes`
- Track `hasAuditFields`, `softDelete`, and `immutable` properties explicitly.
- Example top-level schema:
  ```js
  {
    dbSchema: 'tenantid',
    table: 'vendor_skus',
    hasAuditFields: true,
    softDelete: true,
    version: '1.0.0',
    ...
  }
  ```

---

## JSON and Vector Fields

- Use `jsonb` for flexible metadata (avoid `json`).
- Use vector types only when required by embedding models.
- Example:
  ```js
  { name: 'embedding', type: 'vector(3072)', notNull: false }
  ```

---

## Naming Conventions Summary

| Element           | Convention        | Example                    |
|-------------------|-------------------|----------------------------|
| Table             | plural_snake_case | `vendor_skus`              |
| Column            | snake_case        | `created_at`               |
| Foreign Key       | referenced_id     | `catalog_sku_id`           |
| Timestamp         | *_at              | `deleted_at`               |
| Boolean/Status    | *_flag / *_status | `is_active_flag`           |
| Vector            | vector(dim)       | `embedding: vector(3072)`  |

---

## Notes for AI/Copilot

- Schema definitions using `pg-schemata` give structure Copilot can learn from.
- Keep schema examples in-repo up to date and colocated with business logic.