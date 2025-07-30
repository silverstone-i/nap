'use strict';

/*
 * Copyright © 2025-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { TableModel } from 'pg-schemata';
import embeddingMatchesSchema from '../schemas/embeddingMatchesSchema.js';

class EmbeddingMatches extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, embeddingMatchesSchema, logger);
  }

  /**
   * Delete all matches for given vendor SKU IDs
   * @param {Array<string>} vendorIds - Array of vendor SKU IDs
   * @returns {Promise<number>} Number of deleted records
   */
  async deleteByVendorIds(vendorIds) {
    return this.deleteWhere([{ vendor_sku_id: vendorIds }], 'AND');
  }

  /**
   * Find matches created within a date/time range
   * @param {string} startDate - ISO start date/time
   * @param {string} endDate - ISO end date/time
   * @returns {Promise<Array>} Array of match records
   */
  async findMatchesByDateRange(startDate, endDate) {
    const conditions = [{ created_at: { $gte: startDate } }, { created_at: { $lte: endDate } }];
    return this.findWhere(conditions, 'AND');
  }
}

export default EmbeddingMatches;
