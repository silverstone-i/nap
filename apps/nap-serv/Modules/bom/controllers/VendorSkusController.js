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
import logger from '../../../src/utils/logger.js';

class VendorSkusController extends BaseController {
  constructor() {
    super('vendorSkus');
  }

  /**
   * Import vendor SKUs from spreadsheet (csv/xlsx)
   */
  async importXls(req, res) {
    try {
      // Extract user and file info
      const { user } = req;
      const index = parseInt(req.body.index || '0', 10);
      const file = req.file;

      // Validate file upload
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      // Parse spreadsheet rows
      const rows = await parseWorksheet(file.path, index);

      // Add tenant and creator info to each row
      const dto = rows.map(row => ({
        ...row,
        tenant_code: user.tenant_code,
        created_by: user.user_name,
      }));

      // Set request body and delegate to bulkInsert
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
   * Refactored for clarity, grouping, and logging.
   */
  async bulkInsert(req, res) {
    try {
      const startTime = Date.now();
      // --- Constants ---
      const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-large';

      // --- Extract request data ---
      const { schema } = req;
      const skus = req.body;

      // --- Input validation ---
      if (!Array.isArray(skus) || skus.length === 0) {
        return res.status(400).json({ error: 'No SKUs provided for insertion' });
      }

      // --- Vendor code map and validation ---
      const vendorCodes = [...new Set(skus.map(s => s.vendor_code))];
      if (vendorCodes.length === 0) {
        return res.status(400).json({ error: 'No vendor codes found in SKUs' });
      }
      const vendorQueryConditions = [{ vendor_code: { $in: vendorCodes } }];
      const vendors = await db('vendors', schema).findWhere(vendorQueryConditions, 'AND', { columnWhitelist: ['id', 'vendor_code'] });
      const vendorCodeMap = Object.fromEntries(vendors.map(v => [v.vendor_code, v.id]));
      const missingVendors = vendorCodes.filter(code => !vendorCodeMap[code]);
      if (missingVendors.length > 0) {
        return res.status(400).json({ error: `Unknown vendor_code(s): ${missingVendors.join(', ')}` });
      }

      // --- Catalog embedding map ---
      const catalogEmbeddings = await db('catalogSkus', schema).getCatalogEmbeddings();
      if (!Array.isArray(catalogEmbeddings)) {
        throw new Error('Catalog embeddings must be an array');
      }
      const catalogEmbeddingMap = new Map(catalogEmbeddings.map(row => [row.id, row]));

      // --- Helper: Build match review log ---
      const buildMatchReviewLog = sku => {
        const match = sku.catalog_sku_id ? catalogEmbeddingMap.get(sku.catalog_sku_id) : null;
        return {
          tenant_code: req.user.tenant_code,
          vendor_id: sku.vendor_id,
          vendor_sku: sku.vendor_sku,
          vendor_description: sku.description,
          vendor_description_normalized: sku.description_normalized,
          catalog_sku_id: match?.id ?? null,
          catalog_sku: match?.catalog_sku ?? null,
          catalog_description: match?.description ?? null,
          catalog_description_normalized: match?.description_normalized ?? null,
          confidence: sku.confidence,
          event_type: 'insert',
          status: sku.catalog_sku_id ? 'matched' : 'unmatched',
          notes: sku.catalog_sku_id ? 'matched on insert' : 'no match found',
          created_by: req.user.user_name,
        };
      };

      // --- Normalize SKUs, validate, generate embedding, match ---
      const normalizedSkus = await Promise.all(
        skus.map(async sku => {
          // Validate description
          if (typeof sku.description !== 'string') {
            throw new Error(`Missing or invalid description for SKU ${sku.vendor_sku}`);
          }
          const description_normalized = normalizeDescription(sku.description);
          const { embedding, model } = await generateEmbedding(description_normalized);
          const match = matchToCatalog(embedding, catalogEmbeddings);
          const vendor_id = vendorCodeMap[sku.vendor_code];
          // Assign default model if not present
          return {
            ...sku,
            vendor_id,
            description_normalized,
            model: model ?? DEFAULT_EMBEDDING_MODEL,
            embedding,
            catalog_sku_id: match?.id ?? null,
            confidence: match?.confidence ?? null,
          };
        })
      );

      // --- Logging for inserted and unmatched SKUs ---
      const insertedCount = normalizedSkus.length;
      const unmatchedCount = normalizedSkus.filter(s => !s.catalog_sku_id).length;

      let result;

      // Use a common transaction context to ensure inserts are all or nothing
      await db.tx(async t => {
        const vendorModel = this.model(schema);
        vendorModel.tx = t;

        // --- Bulk insert normalized SKUs ---
        result = await vendorModel.bulkInsert(normalizedSkus);

        // --- Optional match review logging ---
        if (req.user?.enable_match_logging === true) {
          const matchModel = db('matchReviewLogs', 'admin');
          matchModel.tx = t;
          const matchReviewLogs = normalizedSkus.map(buildMatchReviewLog);
          await matchModel.bulkInsert(matchReviewLogs);
        }
      });

      const durationMs = Date.now() - startTime;
      logger.info('Vendor SKUs bulk insert completed', {
        tenant: req.user?.tenant_code,
        user: req.user?.user_name,
        inserted: insertedCount,
        unmatched: unmatchedCount,
        durationMs,
      });

      res.status(201).json({
        message: `${result} SKUs inserted`,
        unmatched: unmatchedCount,
      });
    } catch (err) {
      console.error('Error during bulk insert of vendor SKUs:', err);
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
