# BOM Module Rules

## Table Hierarchy

| Table | Parent FK | Cascade | Notes |
|-------|-----------|---------|-------|
| `catalog_skus` | — | — | Tenant-scoped catalog of internal SKUs |
| `vendor_skus` | vendors (RESTRICT), catalog_skus (SET NULL) | — | Vendor-provided SKUs, matched to catalog |
| `vendor_pricing` | vendor_skus (CASCADE) | CASCADE from vendor SKU | Price records per vendor SKU |

## Matching Workflow

```
Create SKUs → Refresh Embeddings → Find Matches → Accept / Reject / Defer
```

1. **Create** catalog SKUs and vendor SKUs via standard CRUD
2. **Normalize** descriptions automatically on create/update (`description_normalized`)
3. **Embed** via `/refresh-embeddings` endpoints — calls OpenAI `text-embedding-3-large`, stores 3072-dim vectors
4. **Match** via `/match` — returns top-K catalog SKUs ranked by cosine similarity
5. **Auto-match** via `/auto-match` — accepts the best match if confidence >= threshold (default 0.85)
6. **Batch match** via `/batch-match` — runs auto-match for multiple vendor SKUs
7. **Audit** every decision to `admin.match_review_logs`

## Confidence Thresholds

| Range | Color | Meaning |
|-------|-------|---------|
| >= 0.85 | Green (success) | High confidence — safe to auto-accept |
| 0.60 – 0.84 | Yellow (warning) | Medium confidence — human review recommended |
| < 0.60 | Red (error) | Low confidence — likely not a match |

Auto-match only accepts matches at >= 0.85. Below that threshold, the decision is logged as `defer`.

## Match Review Decisions

| Decision | Effect |
|----------|--------|
| `accept` | Sets `vendor_skus.catalog_sku_id` and `confidence`; logs to `match_review_logs` |
| `reject` | No change to vendor SKU; logs rejection for audit |
| `defer` | No change; logged when auto-match falls below threshold |

## Embedding Model

- Default model: `text-embedding-3-large` (3072 dimensions)
- The `model` column on both `catalog_skus` and `vendor_skus` tracks which model generated each embedding
- Changing models requires re-embedding all rows (embeddings from different models are not comparable)

## Soft Delete Convention

All BOM tables use `softDelete: true`:

- Active records: `deactivated_at IS NULL`
- Archived records: `deactivated_at IS NOT NULL`
- Conditional unique index on `catalog_skus.catalog_sku WHERE deactivated_at IS NULL`

## API Routes

All BOM module routes are mounted under `/api/bom/v1/`:

| Endpoint | Entity | Custom Routes |
|----------|--------|---------------|
| `/api/bom/v1/catalog-skus` | Catalog SKUs | `POST /refresh-embeddings` |
| `/api/bom/v1/vendor-skus` | Vendor SKUs | `GET /unmatched`, `POST /match`, `POST /auto-match`, `POST /batch-match`, `POST /refresh-embeddings` |
| `/api/bom/v1/vendor-pricing` | Vendor Pricing | Standard CRUD only |

Match review logs are under the tenants module:

| Endpoint | Entity | Access |
|----------|--------|--------|
| `/api/tenants/v1/match-review-logs` | Match Review Logs | Read-only, NapSoft super users |
