/**
 * @file SKU matching service — AI-powered vendor-to-catalog SKU matching
 * @module bom/services/matchingService
 *
 * Uses pgvector cosine similarity to find and auto-assign catalog SKU matches
 * for vendor SKUs. Logs match decisions to admin.match_review_logs for audit.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import db from '../../../src/db/db.js';
import logger from '../../../src/utils/logger.js';

/**
 * Find similar catalog SKUs for a given vendor SKU using cosine similarity.
 * @param {string} schema Tenant schema name
 * @param {string} vendorSkuId Vendor SKU UUID
 * @param {number} topK Number of results to return
 * @returns {Promise<{ catalog_sku_id: string, sku: string, description: string, similarity: number }[]>}
 */
export async function findSimilarCatalogSkus(schema, vendorSkuId, topK = 5) {
  const vendorSku = await db('vendorSkus', schema).findById(vendorSkuId);
  if (!vendorSku) throw new Error(`Vendor SKU ${vendorSkuId} not found`);

  // Use pgvector cosine distance operator (<=>)
  const results = await db.manyOrNone(
    `SELECT cs.id AS catalog_sku_id, cs.sku, cs.description,
            1 - (vs.embedding <=> cs.embedding) AS similarity
     FROM ${schema}.vendor_skus vs
     CROSS JOIN ${schema}.catalog_skus cs
     WHERE vs.id = $1
       AND vs.embedding IS NOT NULL
       AND cs.embedding IS NOT NULL
       AND cs.deactivated_at IS NULL
     ORDER BY vs.embedding <=> cs.embedding
     LIMIT $2`,
    [vendorSkuId, topK],
  );

  return results.map((r) => ({
    ...r,
    similarity: parseFloat(r.similarity),
  }));
}

/**
 * Auto-match a vendor SKU to a catalog SKU if the best match exceeds the confidence threshold.
 * @param {string} schema Tenant schema name
 * @param {string} vendorSkuId Vendor SKU UUID
 * @param {number} confidenceThreshold Minimum similarity score to auto-assign (default 0.85)
 * @param {string|null} reviewerId UUID of the user performing the match
 * @returns {Promise<{ matched: boolean, catalog_sku_id: string|null, confidence: number|null }>}
 */
export async function autoMatch(schema, vendorSkuId, confidenceThreshold = 0.85, reviewerId = null) {
  const matches = await findSimilarCatalogSkus(schema, vendorSkuId, 1);

  if (matches.length === 0 || matches[0].similarity < confidenceThreshold) {
    // Log deferred match decision
    await logMatchDecision({
      entityType: 'vendor_sku',
      entityId: vendorSkuId,
      matchType: 'auto',
      matchId: matches.length > 0 ? matches[0].catalog_sku_id : null,
      reviewerId,
      decision: 'defer',
      notes: matches.length > 0
        ? `Best match similarity ${matches[0].similarity.toFixed(4)} below threshold ${confidenceThreshold}`
        : 'No catalog SKUs with embeddings found',
    });

    return { matched: false, catalog_sku_id: null, confidence: matches[0]?.similarity || null };
  }

  const bestMatch = matches[0];

  // Update vendor SKU with matched catalog SKU and confidence
  await db.none(
    `UPDATE ${schema}.vendor_skus SET catalog_sku_id = $1, confidence = $2 WHERE id = $3`,
    [bestMatch.catalog_sku_id, bestMatch.similarity, vendorSkuId],
  );

  // Log accepted match decision
  await logMatchDecision({
    entityType: 'vendor_sku',
    entityId: vendorSkuId,
    matchType: 'auto',
    matchId: bestMatch.catalog_sku_id,
    reviewerId,
    decision: 'accept',
    notes: `Auto-matched with similarity ${bestMatch.similarity.toFixed(4)}`,
  });

  logger.info(`Auto-matched vendor SKU ${vendorSkuId} → catalog SKU ${bestMatch.catalog_sku_id} (${bestMatch.similarity.toFixed(4)})`);

  return { matched: true, catalog_sku_id: bestMatch.catalog_sku_id, confidence: bestMatch.similarity };
}

/**
 * Batch match multiple vendor SKUs.
 * @param {string} schema Tenant schema name
 * @param {string[]} vendorSkuIds Array of vendor SKU UUIDs
 * @param {number} confidenceThreshold Minimum similarity score
 * @param {string|null} reviewerId UUID of the user
 * @returns {Promise<{ vendorSkuId: string, matched: boolean, catalog_sku_id: string|null, confidence: number|null }[]>}
 */
export async function batchMatch(schema, vendorSkuIds, confidenceThreshold = 0.85, reviewerId = null) {
  const results = [];
  for (const vendorSkuId of vendorSkuIds) {
    try {
      const result = await autoMatch(schema, vendorSkuId, confidenceThreshold, reviewerId);
      results.push({ vendorSkuId, ...result });
    } catch (err) {
      logger.error(`Batch match failed for vendor SKU ${vendorSkuId}: ${err.message}`);
      results.push({ vendorSkuId, matched: false, catalog_sku_id: null, confidence: null, error: err.message });
    }
  }
  return results;
}

/**
 * Log a match decision to admin.match_review_logs for audit trail.
 * @param {object} params Log entry parameters
 */
async function logMatchDecision({ entityType, entityId, matchType, matchId, reviewerId, decision, notes }) {
  try {
    await db('matchReviewLogs', 'admin').insert({
      entity_type: entityType,
      entity_id: entityId,
      match_type: matchType,
      match_id: matchId,
      reviewer_id: reviewerId,
      decision,
      notes,
    });
  } catch (err) {
    // Non-fatal — log but don't fail the match operation
    logger.error(`Failed to log match decision: ${err.message}`);
  }
}
