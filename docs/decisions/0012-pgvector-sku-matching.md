# ADR-0012: pgvector-Based SKU Matching

**Status**: Accepted
**Date**: 2025-02-11

## Context

The BOM module requires matching vendor SKUs to a canonical catalog of internal SKUs. Vendor descriptions vary wildly — abbreviations, different naming conventions, mixed units — making exact-match or keyword search unreliable. We needed a scalable, accurate matching approach that works within our existing PostgreSQL infrastructure.

## Decision

### pgvector + OpenAI Embeddings

We use the `pgvector` PostgreSQL extension with OpenAI `text-embedding-3-large` (3072 dimensions) to store and compare description embeddings directly in the database. This avoids external vector databases and keeps data co-located with the rest of the tenant schema.

**Workflow:**

1. **Normalize** — Descriptions are lowercased, units expanded (e.g., `"` → `inch`), special characters removed
2. **Embed** — Normalized text is sent to OpenAI's embedding API; the resulting 3072-dimension vector is stored in the row's `embedding` column
3. **Match** — Cosine similarity (`1 - (a <=> b)`) ranks catalog SKUs against a vendor SKU's embedding
4. **Auto-assign** — If the best match exceeds a confidence threshold (default 0.85), the vendor SKU is automatically linked to the catalog SKU
5. **Audit** — Every match decision (accept, reject, defer) is logged to `admin.match_review_logs`

### Column Design

Both `catalog_skus` and `vendor_skus` include:

- `description_normalized` — Cached normalized text used for embedding generation
- `model` — Tracks which embedding model produced the vector (default `text-embedding-3-large`)
- `embedding` — `vector(3072)` column, excluded from pg-schemata ColumnSets via `colProps: { skip: () => true }` since pgvector types are not handled by pg-promise's default serialization

### Embedding Refresh

Embeddings are generated on-demand via `/refresh-embeddings` endpoints, not on every INSERT/UPDATE. This allows batch processing and avoids blocking CRUD operations with external API calls.

### Match Review Logs

All match decisions are written to `admin.match_review_logs` (admin schema, not tenant schema) for cross-tenant audit visibility. The table is read-only via `/api/tenants/v1/match-review-logs` for NapSoft super users.

## Alternatives Considered

1. **External vector DB (Pinecone, Weaviate)** — Adds infrastructure complexity; our dataset fits comfortably in PostgreSQL
2. **Full-text search with tsvector** — Poor at handling abbreviations, unit variations, and semantic similarity
3. **Dedicated matching microservice** — Over-engineered for current scale; pgvector keeps everything in one place
4. **Match on INSERT** — Rejected because OpenAI API latency would block CRUD; batch refresh is more practical

## Consequences

- **Dependency on OpenAI API** — Embedding generation requires an API key and network access; matching without embeddings returns no results
- **3072-dimension vectors** — Larger than typical 1536-dim models but provides better accuracy; HNSW indexes are deferred until pgvector supports >2000 dimensions efficiently
- **Tenant-scoped matching** — Embeddings live in tenant schemas, so matching is always within a single tenant's catalog
- **Audit trail** — Every automated and manual match decision is logged, enabling compliance review and model accuracy tracking
