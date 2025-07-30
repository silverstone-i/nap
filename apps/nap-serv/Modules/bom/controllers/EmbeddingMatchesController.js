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
        console.log('vendorCodes:', vendorCodes || 'None');

        const conditions = [{ vendor_code: { $in: vendorCodes } }];
        console.log('conditions:', conditions);

        const vendors = await db('vendors', schema).findWhere(conditions, 'OR', { columnWhitelist: ['id'] });

        if (vendors.length > 0) {
          // If vendorIds is a const, create a new array and use it for subsequent logic
          vendorIds.push(...vendors.map(v => v.id));

        }

        console.log('vendorIds:', vendorIds);
      }

      // Fetch vendor embeddings
      let vendorEmbeddings;
      if (vendorIds.length === 0) {
        vendorEmbeddings = await EmbeddingSkus.findAllVendorEmbeddings(embeddingModel);
      } else {
        vendorEmbeddings = await EmbeddingSkus.findVendorEmbeddingsByIds(vendorIds, embeddingModel);
      }

      // Fetch catalog embeddings
      const catalogEmbeddings = await EmbeddingSkus.findAllCatalogEmbeddings(embeddingModel);

      // Delete existing matches for these vendors
      if (vendorIds.length > 0) {
        await EmbeddingMatches.deleteByVendorIds(vendorIds);
      }

      // Use utility function for matching
      const { matchVendorToCatalogEmbeddings } = await import('../../../src/utils/embeddingUtils.js');
      const { matched, lowConfidence } = matchVendorToCatalogEmbeddings(vendorEmbeddings, catalogEmbeddings, threshold);

      // Bulk insert matched records
      if (matched.length > 0) {
        await EmbeddingMatches.bulkInsert(matched);
      }

      res.status(200).json({ matched, lowConfidence });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

const instance = new EmbeddingMatchesController();
export default instance;
export { EmbeddingMatchesController };
