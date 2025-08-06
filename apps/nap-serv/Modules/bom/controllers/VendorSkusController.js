'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import BaseController from '../../../src/utils/BaseController.js';
import { parseWorksheet } from '../../../src/utils/xlsUtils.js';
import db from '../../../src/db/db.js';
import { normalizeDescription, generateEmbedding, matchToCatalog } from '../utils/embeddingUtils.js';

class VendorSkusController extends BaseController {
  constructor() {
    super('vendorSkus');
  }

  /**
   * Import vendor SKUs from spreadsheet (csv/xlsx)
   */
  async importXls(req, res) {
    try {
      const { user } = req;
      const index = parseInt(req.body.index || '0', 10);
      const file = req.file;

      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const rows = await parseWorksheet(file.path, index);

      const dto = rows.map(row => ({
        ...row,
        tenant_code: user.tenant_code,
        created_by: user.user_name,
      }));

      req.body = dto;
      return this.bulkInsert(req, res);
    } catch (err) {
      console.error('Error importing XLS:', err);
      res.status(500).json({
        message: 'Failed to import XLS file',
        error: err.message || 'Unknown error',
      });
    }
  }

  /**
   * Bulk insert vendor SKUs from JSON array
   */
  async bulkInsert(req, res) {
    try {
      const { schema } = req;
      const skus = req.body;

      if (!Array.isArray(skus) || skus.length === 0) {
        return res.status(400).json({ error: 'No SKUs provided for insertion' });
      }

      const catalogEmbeddings = await db('catalogSkus', schema).getCatalogEmbeddings();

      if (!Array.isArray(catalogEmbeddings)) {
        throw new Error('Catalog embeddings must be an array');
      }

      const parsedCatalogEmbeddings = catalogEmbeddings.map(row => ({
        ...row,
        embedding: Array.isArray(row.embedding) ? row.embedding : JSON.parse(row.embedding),
      }));
      catalogEmbeddings.splice(0, catalogEmbeddings.length, ...parsedCatalogEmbeddings);

      const vendorCodes = [...new Set(skus.map(s => s.vendor_code))];
      const vendorQueryConditions = [
        { vendor_code: { $in: vendorCodes } }
      ];
      const vendors = await db('vendors', schema).findWhere(vendorQueryConditions, 'AND', { columnWhitelist: ['id', 'vendor_code'] });
      const vendorCodeMap = Object.fromEntries(vendors.map(v => [v.vendor_code, v.id]));

      const normalizedSkus = await Promise.all(
        skus.map(async sku => {
          const description_normalized = normalizeDescription(sku.description);
          const { embedding, model } = await generateEmbedding(description_normalized);
          const match = matchToCatalog(embedding, catalogEmbeddings);

          const vendor_id = vendorCodeMap[sku.vendor_code];
          if (!vendor_id) throw new Error(`Unknown vendor_code: ${sku.vendor_code}`);

          if (req.user?.enable_match_logging === true) {
            await db('matchReviewLogs', 'admin').insert({
              tenant_code: req.user.tenant_code,
              vendor_id,
              vendor_sku: sku.vendor_sku,
              original_catalog_sku_id: match?.id || null,
              confidence_before: match?.confidence || null,
              notes: 'initial match',
              created_by: req.user.user_name
            });
          }

          return {
            ...sku,
            vendor_id,
            description_normalized,
            model: model || 'text-embedding-3-large',
            embedding,
            catalog_sku_id: match?.id || null,
            confidence: match?.confidence || null,
          };
        })
      );

      const result = await this.model(schema).bulkInsert(normalizedSkus);
      res.status(201).json({ message: `${result} SKUs inserted` });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  /**
   * Get all unmatched vendor SKUs for the current tenant
   */
  async getUnmatchedVendorSkus(req, res) {
    try {
    } catch (err) {}
  }
}

const instance = new VendorSkusController();

export default instance; // Use in production and development environments
export { VendorSkusController }; // Use in test environment
