# Design Document: Automatic Vendor SKU to Catalog SKU Matching

## Overview

This document outlines the design for automatic matching of vendor SKUs to catalog SKUs using vector embeddings and cosine similarity. Matches above a configurable threshold are auto-inserted into the matching table, while low-confidence matches are returned for user review.

---

## 1. EmbeddingSkus Model (`modules/bom/models/EmbeddingSkus.js`)

**Functions:**

- `findBySkuAndSource(skuId, source, embeddingModel)`
  - Retrieves embeddings for a given SKU and source.
- `findSimilar(embedding, embeddingModel, limit, threshold)`
  - Finds catalog SKU embeddings similar to a given vendor SKU embedding using cosine similarity.

---

## 2. EmbeddingMatches Model (`modules/bom/models/EmbeddingMatches.js`)

**Functions:**

- `bulkInsert(matches)`
  - Inserts an array of match records into the matching table.
- `findMatchesByDateRange(startDate, endDate)`
  - Retrieves matches created within a specific date/time range for review/audit.

---

## 3. Matching Logic (Controller Layer)

**Location:**

- `EmbeddingMatchesController.js` (recommended for matching API endpoints and review workflows)
- Matching can be triggered from `VendorSkusController.js` after insert/update operations.

**Functions:**

- `matchVendorSkusToCatalogSkus(vendorSkuEmbeddings, catalogSkuEmbeddings, threshold)`
  - Loops through vendor SKU embeddings, finds best catalog match above threshold, and returns `{ matched, lowConfidence }` arrays.
- `autoInsertMatches(matchedArray)`
  - Inserts high-confidence matches into `embedding_matches` table.
- `getMatchesForReview(sinceDate)`
  - Returns matches for user review, filtered by creation date/time.

---

## 4. Workflow Summary

**On Vendor SKU Insert/Update:**

- Generate embeddings for new/updated vendor SKUs (`EmbeddingSkus`).
- Retrieve all catalog SKU embeddings (`EmbeddingSkus`).
- For each vendor SKU embedding:
  - Use `findSimilar` to get best catalog match and similarity score.
  - If score ≥ threshold, add to `matchedArray`; else, add to `lowConfidenceArray`.
- Call `autoInsertMatches(matchedArray)` to insert matches.
- Return both arrays to the client for review.

**User Review:**

- Use `getMatchesForReview(sinceDate)` to display recent matches.
- Allow user to accept, override, or reject matches (handled via controller endpoints).

---

## 5. Database Tables

- `embedding_skus`: Stores all SKU embeddings.
- `embedding_matches`: Stores matched vendor-catalog SKU pairs, similarity score, and timestamps.

---

## 6. Best Practices & Scenarios

- Auto-insert matches above threshold; provide review UI for users.
- Re-match on vendor SKU insert/update and catalog SKU changes.
- Support manual linking/unlinking and audit trail.
- Ensure multi-tenant isolation in all queries and matches.
- Provide match explanations and bulk review workflows.

---

## Pseudocode Example

```
for each vendor_sku_embedding in vendor_embeddings:
    best_match = null
    best_score = 0
    for each catalog_sku_embedding in catalog_embeddings:
        score = cosine_similarity(vendor_sku_embedding, catalog_sku_embedding)
        if score > best_score:
            best_score = score
            best_match = catalog_sku_embedding
    if best_score >= threshold:
        add to matched array and insert into embedding_matches
    else:
        add to lowConfidence array for user review
```

---

## Summary

- Matching logic is centralized in `EmbeddingMatchesController.js`.
- Embedding operations are handled by `EmbeddingSkus.js`.
- Match records are managed by `EmbeddingMatches.js`.
- API endpoints support auto-insertion and user review workflows.
