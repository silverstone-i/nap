/**
 * @file VendorSkus controller — CRUD + match endpoints + unmatched listing
 * @module bom/controllers/vendorSkusController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';
import db from '../../../src/db/db.js';
import { normalizeDescription, generateEmbedding } from '../services/embeddingService.js';
import { findSimilarCatalogSkus, autoMatch, batchMatch } from '../services/matchingService.js';
import logger from '../../../src/utils/logger.js';

class VendorSkusController extends BaseController {
  constructor() {
    super('vendorSkus', 'vendor-sku');
  }

  /**
   * Override create to auto-normalize description.
   */
  async create(req, res) {
    if (req.body.description) {
      req.body.description_normalized = normalizeDescription(req.body.description);
    }
    return super.create(req, res);
  }

  /**
   * Override update to re-normalize description if changed.
   */
  async update(req, res) {
    if (req.body.description) {
      req.body.description_normalized = normalizeDescription(req.body.description);
    }
    return super.update(req, res);
  }

  /**
   * GET /unmatched — list vendor SKUs without a catalog SKU assignment.
   */
  async getUnmatched(req, res) {
    try {
      const schema = this.getSchema(req);
      const unmatched = await db.manyOrNone(
        `SELECT id, vendor_id, vendor_sku, description, description_normalized, confidence
         FROM ${schema}.vendor_skus
         WHERE catalog_sku_id IS NULL AND deactivated_at IS NULL
         ORDER BY created_at DESC`,
      );
      return res.status(200).json({ data: unmatched });
    } catch (err) {
      return this.handleError(err, res, 'fetching unmatched', this.errorLabel);
    }
  }

  /**
   * POST /match — find similar catalog SKUs for a single vendor SKU.
   * Body: { vendor_sku_id, top_k? }
   */
  async match(req, res) {
    try {
      const schema = this.getSchema(req);
      const { vendor_sku_id, top_k = 5 } = req.body;

      if (!vendor_sku_id) {
        return res.status(400).json({ error: 'vendor_sku_id is required' });
      }

      const matches = await findSimilarCatalogSkus(schema, vendor_sku_id, top_k);
      return res.status(200).json({ data: matches });
    } catch (err) {
      return this.handleError(err, res, 'matching', this.errorLabel);
    }
  }

  /**
   * POST /auto-match — auto-assign catalog SKU if confidence exceeds threshold.
   * Body: { vendor_sku_id, confidence_threshold? }
   */
  async autoMatchEndpoint(req, res) {
    try {
      const schema = this.getSchema(req);
      const { vendor_sku_id, confidence_threshold = 0.85 } = req.body;

      if (!vendor_sku_id) {
        return res.status(400).json({ error: 'vendor_sku_id is required' });
      }

      const result = await autoMatch(schema, vendor_sku_id, confidence_threshold, req.user?.id);
      return res.status(200).json(result);
    } catch (err) {
      return this.handleError(err, res, 'auto-matching', this.errorLabel);
    }
  }

  /**
   * POST /batch-match — auto-match multiple vendor SKUs.
   * Body: { vendor_sku_ids[], confidence_threshold? }
   */
  async batchMatchEndpoint(req, res) {
    try {
      const schema = this.getSchema(req);
      const { vendor_sku_ids, confidence_threshold = 0.85 } = req.body;

      if (!vendor_sku_ids || !Array.isArray(vendor_sku_ids) || vendor_sku_ids.length === 0) {
        return res.status(400).json({ error: 'vendor_sku_ids array is required' });
      }

      const results = await batchMatch(schema, vendor_sku_ids, confidence_threshold, req.user?.id);
      return res.status(200).json({ data: results });
    } catch (err) {
      return this.handleError(err, res, 'batch-matching', this.errorLabel);
    }
  }

  /**
   * POST /refresh-embeddings — generate embeddings for vendor SKUs missing them.
   */
  async refreshEmbeddings(req, res) {
    try {
      const schema = this.getSchema(req);

      const skus = await db.manyOrNone(
        `SELECT id, description_normalized FROM ${schema}.vendor_skus
         WHERE description_normalized IS NOT NULL
           AND embedding IS NULL
           AND deactivated_at IS NULL
         ORDER BY created_at
         LIMIT 500`,
      );

      if (skus.length === 0) {
        return res.status(200).json({ message: 'No vendor SKUs need embedding refresh', refreshed: 0 });
      }

      let refreshed = 0;
      for (const sku of skus) {
        try {
          const embedding = await generateEmbedding(sku.description_normalized);
          const vecString = `[${embedding.join(',')}]`;
          await db.none(
            `UPDATE ${schema}.vendor_skus SET embedding = $1::vector WHERE id = $2`,
            [vecString, sku.id],
          );
          refreshed++;
        } catch (err) {
          logger.error(`Failed to generate embedding for vendor SKU ${sku.id}: ${err.message}`);
        }
      }

      logger.info(`Refreshed embeddings for ${refreshed}/${skus.length} vendor SKUs`);
      return res.status(200).json({ message: `Refreshed ${refreshed} vendor SKU embeddings`, refreshed, total: skus.length });
    } catch (err) {
      return this.handleError(err, res, 'refreshing embeddings for', this.errorLabel);
    }
  }
}

const instance = new VendorSkusController();
export default instance;
export { VendorSkusController };
