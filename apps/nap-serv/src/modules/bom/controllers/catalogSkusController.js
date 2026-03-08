/**
 * @file CatalogSkus controller — CRUD + embedding refresh endpoint
 * @module bom/controllers/catalogSkusController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import db, { pgp } from '../../../db/db.js';
import { normalizeDescription, generateEmbedding } from '../services/embeddingService.js';
import logger from '../../../lib/logger.js';

class CatalogSkusController extends BaseController {
  constructor() {
    super('catalogSkus', 'catalog-sku');
  }

  /**
   * Override create to inject tenant_id and auto-normalize description.
   */
  async create(req, res) {
    if (!req.body.tenant_id && req.user?.tenant_id) {
      req.body.tenant_id = req.user.tenant_id;
    }
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
   * Refresh embeddings for catalog SKUs that have a normalized description but no embedding.
   * POST /refresh-embeddings
   */
  async refreshEmbeddings(req, res) {
    try {
      const schema = this.getSchema(req);
      const s = pgp.as.name(schema);

      // Find catalog SKUs missing embeddings
      const skus = await db.manyOrNone(
        `SELECT id, description_normalized FROM ${s}.catalog_skus
         WHERE description_normalized IS NOT NULL
           AND embedding IS NULL
           AND deactivated_at IS NULL
         ORDER BY created_at
         LIMIT 500`,
      );

      if (skus.length === 0) {
        return res.status(200).json({ message: 'No catalog SKUs need embedding refresh', refreshed: 0 });
      }

      let refreshed = 0;
      for (const sku of skus) {
        try {
          const embedding = await generateEmbedding(sku.description_normalized);
          const vecString = `[${embedding.join(',')}]`;
          await db.none(`UPDATE ${s}.catalog_skus SET embedding = $1::vector WHERE id = $2`, [vecString, sku.id]);
          refreshed++;
        } catch (err) {
          logger.error(`Failed to generate embedding for catalog SKU ${sku.id}: ${err.message}`);
        }
      }

      logger.info(`Refreshed embeddings for ${refreshed}/${skus.length} catalog SKUs`);
      return res.status(200).json({ message: `Refreshed ${refreshed} catalog SKU embeddings`, refreshed, total: skus.length });
    } catch (err) {
      return this.handleError(err, res, 'refreshing embeddings for', this.errorLabel);
    }
  }
}

const instance = new CatalogSkusController();
export default instance;
export { CatalogSkusController };
