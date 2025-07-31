'use strict';

/*
 * Copyright © 2025-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import BaseController from '../../../src/utils/BaseController.js';
import db from '../../../src/db/db.js';
import { matchVendorToCatalogEmbeddings } from '../../../src/utils/embeddingUtils.js';

class EmbeddingMatchesController extends BaseController {
  constructor() {
    super('embeddingMatches');
  }

  /**
   * Execute matching for given vendor SKUs (empty array = all vendors)
   * @param {Array<string>} vendorIds - Array of vendor SKU IDs, empty for all vendors
   * @param {Object} options - Additional options (e.g., threshold)
   * @returns {Promise<{matched: Array, lowConfidence: Array}>}
   */
  async executeMatches(req, res) {
    try {
      const { vendorIds = [], vendorCodes = [], options = {} } = req.body;
      const threshold = options.threshold || Number(process.env.MATCH_THRESHOLD) || 0.8;
      const embeddingModel = options.embeddingModel || 'text-embedding-3-small';
      const schema = req.schema;

      // Get model instances
      const EmbeddingSkus = db('embeddingSkus', schema);
      const EmbeddingMatches = db('embeddingMatches', schema);

      //Fetch vendorId's, if needed
      if (vendorCodes.length > 0) {
        const conditions = [{ vendor_code: { $in: vendorCodes } }];
        const vendors = await db('vendors', schema).findWhere(conditions, 'OR', { columnWhitelist: ['id'] });

        if (vendors.length > 0) {
          vendorIds.push(...vendors.map(v => v.id));
        }
      }

      // Fetch vendor embeddings
      let vendorEmbeddings;
      if (vendorIds.length === 0) {
        vendorEmbeddings = await EmbeddingSkus.findAllVendorEmbeddings(embeddingModel);
      } else {
        vendorEmbeddings = await this.findVendorEmbeddingsByIds(vendorIds, schema, embeddingModel);
      }

      // Fetch catalog embeddings
      const catalogEmbeddings = await EmbeddingSkus.findAllCatalogEmbeddings(embeddingModel);

      // Delete existing matches for these vendor embeddings
      if (vendorEmbeddings.length > 0) {
        const embeddingSkuIds = vendorEmbeddings.map(e => e.id);
        const result = await EmbeddingMatches.deleteByEmbeddingSkuIds(embeddingSkuIds);
        console.log(`Deleted ${result} existing matches for vendor embeddings`);
      }

      // Use utility function for matching
      const { matches, lowConfidence } = matchVendorToCatalogEmbeddings(vendorEmbeddings, catalogEmbeddings, {
        threshold,
        embeddingModel,
        tenantCode: req.user.tenant_code,
      });

      // Bulk insert matched records
      if (matches.length > 0) {
        await EmbeddingMatches.bulkInsert(matches);
      }

      res.status(200).json({ matches, lowConfidence });
    } catch (err) {
      console.error('Error executing matches:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Fetch vendor embeddings by array of vendor IDs
   * @param {Array<string>} vendorIds - Array of vendor SKU IDs
   * @param {string} [embeddingModel] - Optional AI model filter
   * @returns {Promise<Array>} Array of vendor embedding records
   */
  async findVendorEmbeddingsByIds(vendorIds, schema, embeddingModel = null) {
    // Custom join query to get embeddings for given vendorIds
    const model = embeddingModel ? `AND es.model = '${embeddingModel}'` : '';
    const vendorIdList = vendorIds.map(id => `'${id}'`).join(',');
    const query = `
      SELECT es.*
      FROM ${schema}.embedding_skus es
      JOIN ${schema}.vendor_skus vs ON es.sku_id = vs.id
      WHERE vs.vendor_id IN (${vendorIdList})
      ${model}
      AND es.source = 'vendor'
    `;

    return await db.any(query);
  }
}

const instance = new EmbeddingMatchesController();
export default instance;
export { EmbeddingMatchesController };
