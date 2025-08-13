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
      const MATCH_THRESHOLD = req.user?.match_threshold || 0.8;

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
          catalog_sku: match?.catalog_sku ?? null,
          catalog_description: match?.description ?? null,
          catalog_description_normalized: match?.description_normalized ?? null,
          confidence: sku.confidence,
          match_threshold: MATCH_THRESHOLD,
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
          const match = matchToCatalog(embedding, catalogEmbeddings, MATCH_THRESHOLD);
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

      // --- Optional match review logging ---
      if (req.user?.enable_match_logging === true) {
        const matchReviewLogs = normalizedSkus.map(buildMatchReviewLog);
        await db('matchReviewLogs', 'admin').bulkInsert(matchReviewLogs);
      }

      // --- Bulk insert normalized SKUs ---
      const result = await this.model(schema).bulkInsert(normalizedSkus);

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
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  /**
   * Bulk update catalog matches for vendor SKUs
   * Refactored for clarity, grouping, and logging to match bulkInsert style.
   * Expects array of { vendor_code, vendor_sku, catalog_sku }.
   */
  async bulkUpdate(req, res) {
    try {
      // --- Extract request data ---
      const { schema } = req;
      const updates = req.body;
      const user = req.user;

      // --- Input validation ---
      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }
      for (const row of updates) {
        if (!row.vendor_code || !row.vendor_sku || !row.catalog_sku) {
          return res.status(400).json({ error: 'Each update must include vendor_code, vendor_sku, and catalog_sku' });
        }
      }

      // --- Vendor code map and validation ---
      const vendorCodes = [...new Set(updates.map(u => u.vendor_code))];
      if (vendorCodes.length === 0) {
        return res.status(400).json({ error: 'No vendor codes found in updates' });
      }
      const vendors = await db('vendors', schema).findWhere([{ vendor_code: { $in: vendorCodes } }], 'AND', { columnWhitelist: ['id', 'vendor_code'] });
      const vendorCodeMap = Object.fromEntries(vendors.map(v => [v.vendor_code, v.id]));
      const missingVendors = vendorCodes.filter(code => !vendorCodeMap[code]);
      if (missingVendors.length > 0) {
        return res.status(400).json({ error: `Unknown vendor_code(s): ${missingVendors.join(', ')}` });
      }

      // --- Catalog SKU map and validation ---
      const catalogSkus = [...new Set(updates.map(u => u.catalog_sku))];
      if (catalogSkus.length === 0) {
        return res.status(400).json({ error: 'No catalog_sku values found in updates' });
      }
      const catalogRows = await db('catalogSkus', schema).findWhere([{ catalog_sku: { $in: catalogSkus } }], 'AND', { columnWhitelist: ['id', 'catalog_sku', 'description', 'description_normalized'] });
      const catalogSkuMap = Object.fromEntries(catalogRows.map(r => [r.catalog_sku, r]));
      const missingCatalogs = catalogSkus.filter(sku => !catalogSkuMap[sku]);
      if (missingCatalogs.length > 0) {
        return res.status(400).json({ error: `Unknown catalog_sku(s): ${missingCatalogs.join(', ')}` });
      }

      // --- Vendor SKU map and validation ---
      const vendorSkuTuples = updates.map(u => ({
        vendor_id: vendorCodeMap[u.vendor_code],
        vendor_sku: u.vendor_sku,
      }));
      const vendorSkuRows = await db('vendorSkus', schema).findWhere(
        vendorSkuTuples.map(({ vendor_id, vendor_sku }) => ({ vendor_id, vendor_sku })),
        'OR',
        { columnWhitelist: ['id', 'vendor_id', 'vendor_sku', 'description', 'description_normalized'] }
      );
      const vendorSkuMap = new Map(vendorSkuRows.map(r => [`${r.vendor_id}|${r.vendor_sku}`, r]));
      const missingVendorSkus = vendorSkuTuples.filter(({ vendor_id, vendor_sku }) => !vendorSkuMap.has(`${vendor_id}|${vendor_sku}`));
      if (missingVendorSkus.length > 0) {
        return res.status(400).json({ error: `Unknown vendor_sku(s): ${missingVendorSkus.map(x => `${x.vendor_id || ''}:${x.vendor_sku}`).join(', ')}` });
      }

      // --- Prepare update payloads ---
      const updatePayloads = updates.map(u => {
        const vendor_id = vendorCodeMap[u.vendor_code];
        const catalog = catalogSkuMap[u.catalog_sku];
        const vendorSku = vendorSkuMap.get(`${vendor_id}|${u.vendor_sku}`);
        return {
          id: vendorSku.id,
          catalog_sku_id: catalog.id,
          confidence: 1.0,
          updated_by: user.user_name,
        };
      });

      // --- Helper: Build match review log ---
      const MATCH_THRESHOLD = req.user?.match_threshold || 0.8;

      const buildMatchReviewLog = u => {
        const vendor_id = vendorCodeMap[u.vendor_code];
        const catalog = catalogSkuMap[u.catalog_sku];
        const vendorSku = vendorSkuMap.get(`${vendor_id}|${u.vendor_sku}`);

        return {
          tenant_code: user.tenant_code,
          vendor_id,
          vendor_sku: u.vendor_sku,
          vendor_description: vendorSku.description,
          vendor_description_normalized: vendorSku.description_normalized,
          catalog_sku: u.catalog_sku,
          catalog_description: catalog.description,
          catalog_description_normalized: catalog.description_normalized,
          confidence: 1.0,
          match_threshold: MATCH_THRESHOLD,
          event_type: 'update',
          status: 'ok',
          notes: 'manual catalog match',
          created_by: user.user_name,
        };
      };

      // --- Optional match review logging ---
      let matchReviewLogs = [];
      if (user?.enable_match_logging === true) {
        matchReviewLogs = updates.map(buildMatchReviewLog);
      }

      // --- Transaction: bulk update and log ---
      let result;
      await db.tx(async t => {
        const vendorModel = this.model(schema);
        vendorModel.tx = t;
        result = await vendorModel.bulkUpdate(updatePayloads);
        if (matchReviewLogs.length > 0) {
          const matchModel = db('matchReviewLogs', 'admin');
          matchModel.tx = t;
          await matchModel.bulkInsert(matchReviewLogs);
        }
      });

      res.status(200).json({ message: `${updatePayloads.length} SKUs updated` });
    } catch (err) {
      console.error('Error during bulk update of vendor SKUs:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  /**
   * Get all unmatched vendor SKUs for the current tenant
   */
  async getUnmatchedVendorSkus(req, res) {
    try {
      const { schema } = req;

      // Pagination and sorting
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : 50;
      const offset = req.query.offset !== undefined ? Number(req.query.offset) : 0;
      let orderBy = req.query.orderBy ?? ['vendor_id', 'vendor_sku'];
      if (typeof orderBy === 'string') {
        try {
          const parsed = JSON.parse(orderBy);
          if (Array.isArray(parsed)) orderBy = parsed;
          else throw new Error('not array');
        } catch {
          orderBy = orderBy.split(',').map(s => s.trim());
        }
      }

      const options = { limit, offset, orderBy };

      if (req.query.columnWhitelist) {
        options.columnWhitelist = JSON.parse(req.query.columnWhitelist);
      }
      if (req.query.includeDeactivated === 'true') {
        options.includeDeactivated = true;
      }

      // Base condition: unmatched only
      const conditions = [{ catalog_sku_id: null }];

      // Optional vendor filters: vendor_id or vendor_code(s)
      let vendorIds = [];
      if (req.query.vendor_id) {
        const v = Array.isArray(req.query.vendor_id) ? req.query.vendor_id : String(req.query.vendor_id).split(',');
        vendorIds = v.map(x => Number(x)).filter(n => Number.isFinite(n));
      } else if (req.query.vendor_code || req.query.vendor_codes) {
        const raw = req.query.vendor_code || req.query.vendor_codes;
        const vendorCodes = Array.isArray(raw)
          ? raw
          : String(raw)
              .split(',')
              .map(s => s.trim())
              .filter(Boolean);
        if (vendorCodes.length > 0) {
          const vendors = await db('vendors', schema).findWhere([{ vendor_code: { $in: vendorCodes } }], 'AND', { columnWhitelist: ['id', 'vendor_code'] });
          vendorIds = vendors.map(v => v.id);
          // If none match provided codes, return empty quickly
          if (vendorIds.length === 0) {
            return res.json({ records: [], pagination: { total: 0, limit, offset } });
          }
        }
      }
      if (vendorIds.length > 0) {
        conditions.push({ vendor_id: { $in: vendorIds } });
      }

      // Search across vendor_sku, description, description_normalized
      if (req.query.q && String(req.query.q).trim()) {
        const q = String(req.query.q).trim();
        const pattern = `%${q}%`;
        conditions.push({ $or: [{ vendor_sku: { $ilike: pattern } }, { description: { $ilike: pattern } }, { description_normalized: { $ilike: pattern } }] });
      }

      const [records, total] = await Promise.all([this.model(schema).findWhere(conditions, 'AND', options), this.model(schema).countWhere ? this.model(schema).countWhere(conditions, 'AND', options) : Promise.resolve(null)]);

      return res.json({
        records,
        pagination: total !== null ? { total, limit, offset } : undefined,
      });
    } catch (err) {
      logger.error('Error fetching unmatched vendor SKUs', { error: err?.message });
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  /**
   * Update vendor SKUs with special handling for vendor_sku renames and description changes.
   * - vendor_sku: enforce uniqueness per vendor
   * - description: normalize + embed; recompute match confidence without changing catalog_sku_id
   */
  async update(req, res) {
    const { schema } = req;
    const user = req.user;
    const body = req.body || {};
    const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-large';
    const MATCH_THRESHOLD = req.user?.match_threshold || 0.8;

    try {
      // --- Locate target record by id or vendor_code + vendor_sku ---
      let target;
      let filters = [];
      if (req.query?.id) {
        filters = [{ id: req.query.id }];
      } else if (req.query?.vendor_code && req.query?.vendor_sku) {
        const vendors = await db('vendors', schema).findWhere([{ vendor_code: req.query.vendor_code }], 'AND', { columnWhitelist: ['id', 'vendor_code'] });
        const vendor = vendors[0];
        if (!vendor) return res.status(404).json({ error: 'Unknown vendor_code' });
        filters = [{ vendor_id: vendor.id }, { vendor_sku: req.query.vendor_sku }];
      } else {
        return res.status(400).json({ error: 'Provide id or vendor_code and vendor_sku in query' });
      }

      const rows = await db('vendorSkus', schema).findWhere(filters, 'AND', {
        columnWhitelist: ['id', 'tenant_code', 'vendor_id', 'vendor_sku', 'description', 'description_normalized', 'catalog_sku_id', 'confidence', 'model', 'embedding'],
      });
      target = rows?.[0];
      if (!target) return res.status(404).json({ error: 'vendor_sku not found' });

      const updates = { updated_by: user?.user_name };
      const matchLogs = [];

      // --- Handle vendor_sku rename ---
      if (typeof body.vendor_sku === 'string' && body.vendor_sku.trim() && body.vendor_sku.trim() !== target.vendor_sku) {
        const newSku = body.vendor_sku.trim();
        // Uniqueness check: (vendor_id, vendor_sku)
        const conflict = await db('vendorSkus', schema).findWhere([{ vendor_id: target.vendor_id }, { vendor_sku: newSku }], 'AND', { columnWhitelist: ['id'] });
        if (conflict.length && conflict[0].id !== target.id) {
          return res.status(409).json({ error: 'vendor_sku already exists for this vendor' });
        }
        updates.vendor_sku = newSku;
      }

      // --- Handle description change: normalize + embed + recompute confidence ---
      if (typeof body.description === 'string' && body.description.trim()) {
        const description = body.description;
        const description_normalized = normalizeDescription(description);

        let embedding = null;
        let model = null;
        let embeddingGenerated = false;
        try {
          const out = await generateEmbedding(description_normalized);
          embedding = out.embedding;
          model = out.model || DEFAULT_EMBEDDING_MODEL;
          embeddingGenerated = true;
        } catch (e) {
          logger.error('Failed generating embedding during vendor_skus update', { error: e?.message });
        }

        let newConfidence = undefined;
        let match = null;
        if (embeddingGenerated && embedding) {
          const catalogEmbeddings = await db('catalogSkus', schema).getCatalogEmbeddings();
          match = matchToCatalog(embedding, catalogEmbeddings, MATCH_THRESHOLD);
        }

        // Do not change catalog_sku_id on description update; adjust confidence rules per spec
        if (target.catalog_sku_id && match) {
          if (match.id === target.catalog_sku_id) {
            newConfidence = match.confidence;
          } else {
            newConfidence = 1.0;
          }
        }

        updates.description = description;
        updates.description_normalized = description_normalized;
        // Ensure the embedding reflects the new description. If we failed to generate, clear the old embedding.
        if (embeddingGenerated && embedding) {
          updates.embedding = embedding;
          if (model) updates.model = model;
        } else {
          updates.embedding = null;
        }
        if (newConfidence !== undefined) updates.confidence = newConfidence;

        // Optional match review logging
        if (user?.enable_match_logging === true) {
          let catalogSkuRow = null;
          if (target.catalog_sku_id) {
            const rows = await db('catalogSkus', schema).findWhere([{ id: target.catalog_sku_id }], 'AND', {
              columnWhitelist: ['catalog_sku', 'description', 'description_normalized'],
            });
            catalogSkuRow = rows?.[0] || null;
          }
          const logNotes = embeddingGenerated ? 'description updated; catalog link unchanged' : 'description updated; embedding failed; catalog link unchanged';
          matchLogs.push({
            tenant_code: user.tenant_code,
            vendor_id: target.vendor_id,
            vendor_sku: updates.vendor_sku || target.vendor_sku,
            vendor_description: description,
            vendor_description_normalized: description_normalized,
            catalog_sku: catalogSkuRow?.catalog_sku || null,
            catalog_description: catalogSkuRow?.description || null,
            catalog_description_normalized: catalogSkuRow?.description_normalized || null,
            confidence: newConfidence ?? target.confidence ?? null,
            match_threshold: MATCH_THRESHOLD,
            event_type: 'update',
            status: match && target.catalog_sku_id ? (match.id === target.catalog_sku_id ? 'same' : 'different') : 'no_match',
            notes: logNotes,
            created_by: user.user_name,
          });
        }
      }

      if (Object.keys(updates).length <= 1) {
        // nothing to update other than updated_by
        return res.status(400).json({ error: 'No updatable fields provided' });
      }

      // --- Execute update (and log) in a transaction ---
      let updatedCount = 0;
      await db.tx(async t => {
        const model = this.model(schema);
        model.tx = t;
        updatedCount = await model.updateWhere([{ id: target.id }], updates);
        if (matchLogs.length > 0) {
          const matchModel = db('matchReviewLogs', 'admin');
          matchModel.tx = t;
          await matchModel.bulkInsert(matchLogs);
        }
      });

      return res.json({ updatedRecords: updatedCount });
    } catch (err) {
      logger.error('Error updating vendor_skus', { error: err?.message });
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }
}

const instance = new VendorSkusController();

export default instance; // Use in production and development environments
export { VendorSkusController }; // Use in test environment
