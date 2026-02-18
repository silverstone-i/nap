# 0012. pgvector Embeddings for SKU Matching over Fuzzy String Matching

**Date:** 2025-02-17
**Status:** accepted
**Author:** NapSoft

## Context

NAP's procurement module must match vendor-specific SKUs to a master catalog of internal SKUs. Vendors use inconsistent naming — abbreviations, synonyms, different languages, varying word order — making exact string matching impossible. The matching system must handle semantic equivalence (e.g., "SS 304 pipe 2in" matches "2-inch stainless steel 304 pipe") and scale with catalog growth without degrading match quality.

## Decision

Use pgvector with OpenAI `text-embedding-3-large` (3072-dimensional vectors) for semantic similarity matching:

**Tables:**
- `catalog_skus` — master SKU catalog with an `embedding` column (`vector(3072)`)
- `vendor_skus` — vendor-specific SKUs with `embedding`, `confidence` (0.0–1.0), and FK to matched catalog SKU

**Custom methods:**
- `findBySku(vendor_id, vendor_sku)` — lookup by composite key
- `getUnmatched()` — retrieve vendor SKUs without catalog matches
- `refreshEmbeddings(vendorSkuBatches)` — batch update embeddings from the OpenAI API

**Audit trail:** `match_review_logs` (in `admin` schema) records all SKU matching decisions (accept/reject/defer) with reviewer, timestamp, and confidence score.

**Matching flow:** Vendor SKU description → embedding → cosine similarity against catalog SKU embeddings → ranked candidates → human review for low-confidence matches.

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| Fuzzy string matching (Levenshtein, trigram, `pg_trgm`) | No external API dependency; built into PostgreSQL; fast for simple typos | Brittle for abbreviations, synonyms, and cross-language variations; edit distance does not capture semantic meaning; quality degrades as catalog diversity grows |
| Dedicated ML matching service (external microservice) | Full control over model; can use custom training data | Operational complexity of a separate service; network latency; deployment and scaling overhead; overkill when pgvector handles the workload in-database |

## Consequences

**Positive:**
- Semantic similarity — embeddings capture meaning, not just character patterns; "SS 304" and "stainless steel 304" are recognized as equivalent
- Language-agnostic — embeddings work across languages without separate dictionaries or transliteration
- Scales with catalog size — vector similarity search with pgvector indexes (IVFFlat/HNSW) maintains performance as the catalog grows
- In-database — no external matching service; queries and matching happen in PostgreSQL alongside transactional data

**Negative:**
- External API dependency — embedding generation requires calls to OpenAI; rate limits and costs apply
- 3072-dimensional vectors consume significant storage per row
- Embedding quality depends on the upstream model — model changes or deprecation require re-embedding the catalog
- Human review required for low-confidence matches adds a manual step to the procurement workflow
