# Agent Prompt: Vendor SKU Matching & Pricing (pg-schemata)

You are working on a Node.js (ESM) monorepo project with Express and PostgreSQL using **schema-qualified, per-tenant** databases. Follow the project’s modular structure and strict coding conventions.

---

## 🧭 Project Conventions

- **Language/Platform**: Node.js (ESM), Express, PostgreSQL
- **Multi-tenancy**:
  - Each tenant has a **dedicated PostgreSQL schema**
  - All queries must be **explicitly schema-qualified**
  - `pg-schemata` handles schema-specific table registration and connection logic
  - `tenant_code` is included in each table **for informational purposes only** (e.g. super_admin views) — not used in query filtering
- **ORM**: Use `pg-schemata`
  - Define tables with `defineTable`
  - Extend `TableModel` for model logic
- **Routing**: Static Express routers, defined once and not dynamically registered
- **File conventions**:
  - `models/`: PascalCase filenames, all models extend `TableModel`
  - `controllers/`: PascalCase filenames, all controllers extend `BaseController`
  - `schemas/`: Must follow `TableSchema` export pattern
- **Imports/Exports**: ES6 (`import`, `export`)
- **Repositories**: Use camelCase object keys
- **Reference files**: Match style of `CatalogSkus.js` and `CatalogSkusController.js`

---

## 🎯 Goal

Implement:

1. **Vendor SKU normalization and storage**
2. **OpenAI embedding generation and catalog matching**
3. **Vendor pricing tracking as a separate table**

---

## 📦 Tables

### `vendor_skus`
- `id UUID`
- `tenant_code TEXT`
- `vendor_id TEXT`
- `vendor_sku TEXT`
- `description TEXT`
- `description_normalized TEXT`
- `catalog_sku UUID` (FK to `catalog_skus`)
- `model TEXT`
- `embedding VECTOR` (pgvector)

### `catalog_skus`
- Reference implementation: see `CatalogSkus.js`
- Includes normalized description and embedding

### `vendor_pricing`
- `id UUID`
- `tenant_code TEXT`
- `vendor_sku_id UUID` (FK to `vendor_skus`)
- `unit_price NUMERIC`
- `unit TEXT`
- `effective_date DATE`

---

## 📐 Implementation Guidelines

### Schemas (`schemas/`)
- Define each table using `defineTable`
- Use `pgvector` for embedding columns
- Add foreign keys where appropriate
- Include `tenant_code` (for super admin reporting)

### Models (`models/`)
- Each table gets a model extending `TableModel`
- Add helper methods: `insert`, `update`, `findBySku`, `getUnmatched`, etc.
- Do **not** put business logic in models

### Controllers (`controllers/`)
- Implement logic for:
  - Inserting new vendor SKUs
    - Normalize description
    - Generate embedding via OpenAI
    - Match against catalog SKUs using cosine similarity
    - Store matched `catalog_sku` if match ≥ confidence threshold
  - Inserting new catalog SKUs (same normalization + embedding)
  - Inserting vendor pricing
  - Optional: bulk rematch

- Controllers must extend `BaseController`

### Utilities
- `normalizer.js`: expands abbreviations, formats units, converts fractions
- `embeddingService.js`: wraps OpenAI API calls
- `matchToCatalog()`: ranks catalog embeddings by cosine similarity

### Routes
Add routes under `/bom`:
- `POST /bom/vendor-skus`
- `POST /bom/catalog-skus`
- `POST /bom/vendor-pricing`
- `POST /bom/rematch`

---

## ✅ Feedback & Code Review Expectations

- **Do not** include praise, filler, or agreement
- **Always** follow project structure or point out violations
- **Review existing files** before generating new ones
- Flag incorrect naming, table design, or controller logic
- Maintain parity with the style in `CatalogSkus.js` and `CatalogSkusController.js`

---

## 🔁 Follow-Up Prompt

> Start by generating the schema definitions and models for `vendor_skus`, `catalog_skus`, and `vendor_pricing`, using `defineTable` and extending `TableModel`. Ensure vector types are defined using `pgvector`, `tenant_code` is included (for super_admin use), and that `catalog_sku` is a foreign key. Once schema and models are complete, proceed to the controller logic for inserting a new vendor SKU — which must normalize the description, embed it, and attempt to match against existing catalog SKUs.
