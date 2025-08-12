'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

// BaseController provides standard CRUD/bulk/import helpers used across modules
import BaseController from '../../../src/utils/BaseController.js';
import { parseWorksheet } from '../../../src/utils/xlsUtils.js';
import { getFieldFromRow, normalizeExcelDate, normalizeUnitPrice, coerceUnit } from '../utils/embeddingUtils.js';
import db from '../../../src/db/db.js';
import logger from '../../../src/utils/logger.js';

class VendorPricingController extends BaseController {
  constructor() {
    super('vendorPricing', 'vendor pricing');
  }

  /**
   * Import vendor pricing from spreadsheet (csv/xlsx).
   * Expected columns per row:
   * - vendor_code (string)
   * - vendor_sku (string)
   * - unit_price (number)
   * - unit (string)
   * - effective_date (date string or Excel date)
   *
   * Resolves vendor_sku_id using (vendor_code, vendor_sku) and inserts records.
   */
  async importXls(req, res) {
    try {
      // Extract request context and options from form-data
      const { user, schema } = req;
      const index = parseInt(req.body.index || '0', 10);
      const date1904 = req.body?.date1904 === 'true' || req.body?.date1904 === true;
      const file = req.file;

      // Validate file upload
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      // Parse spreadsheet rows from the given sheet index
      const rows = await parseWorksheet(file.path, index);

      // Ensure there is data to process
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'No pricing rows found in spreadsheet' });
      }

      // Resolve flexible header names per row (supports varied labels like "Unit Price ($)") via shared helper

      // Normalize raw rows to a consistent shape used by downstream logic
      const resolved = rows.map(r => {
        const vendor_code = getFieldFromRow(r, ['vendor_code', 'vendor code', 'Vendor Code', 'VendorCode']);
        const vendor_sku = getFieldFromRow(r, ['vendor_sku', 'vendor sku', 'Vendor SKU', 'VendorSku', 'sku']);
        const unit_price_raw = getFieldFromRow(r, ['unit_price', 'unit price', 'Unit Price', 'price', 'cost']);
        const unit = getFieldFromRow(r, ['unit', 'Unit', 'uom', 'UOM']);
        const effective_date_raw = getFieldFromRow(r, ['effective_date', 'effective date', 'Effective Date', 'date', 'Date']);
        return {
          vendor_code: typeof vendor_code === 'string' ? vendor_code.trim() : vendor_code,
          vendor_sku: typeof vendor_sku === 'string' ? vendor_sku.trim() : vendor_sku,
          unit_price_raw,
          unit: typeof unit === 'string' ? unit.trim() : unit,
          effective_date_raw,
        };
      });

      // Build vendor_code -> vendor_id lookup
      const vendorCodes = [...new Set(resolved.map(r => r.vendor_code).filter(Boolean))];
      if (vendorCodes.length === 0) {
        return res.status(400).json({ error: 'Missing vendor_code values' });
      }

      const vendors = await db('vendors', schema).findWhere([{ vendor_code: { $in: vendorCodes } }], 'AND', { columnWhitelist: ['id', 'vendor_code'] });
      const vendorCodeMap = Object.fromEntries(vendors.map(v => [v.vendor_code, v.id]));
      const missingVendors = vendorCodes.filter(code => !vendorCodeMap[code]);
      if (missingVendors.length > 0) {
        return res.status(400).json({ error: `Unknown vendor_code(s): ${missingVendors.join(', ')}` });
      }

      // Build (vendor_id, vendor_sku) -> vendor_sku_id lookup from vendorSkus
      const vendorSkuPairs = resolved.filter(r => r.vendor_code && r.vendor_sku).map(r => ({ vendor_id: vendorCodeMap[r.vendor_code], vendor_sku: r.vendor_sku }));

      const vendorSkuRows = await db('vendorSkus', schema).findWhere(
        vendorSkuPairs.map(p => ({ vendor_id: p.vendor_id, vendor_sku: p.vendor_sku })),
        'OR',
        { columnWhitelist: ['id', 'vendor_id', 'vendor_sku'] }
      );
      const vendorSkuKey = (vendor_id, vendor_sku) => `${vendor_id}|${vendor_sku}`;
      const vendorSkuMap = new Map(vendorSkuRows.map(r => [vendorSkuKey(r.vendor_id, r.vendor_sku), r.id]));

      // Validate that all referenced (vendor_code, vendor_sku) exist
      const missingVendorSkuRefs = vendorSkuPairs.filter(p => !vendorSkuMap.get(vendorSkuKey(p.vendor_id, p.vendor_sku)));
      if (missingVendorSkuRefs.length > 0) {
        const sample = missingVendorSkuRefs
          .slice(0, 5)
          .map(x => `${x.vendor_id}:${x.vendor_sku}`)
          .join(', ');
        return res.status(400).json({ error: `Unknown vendor_sku for given vendor_code. Sample: ${sample}` });
      }

      // Pre-validate and convert date and unit_price fields using shared helpers
      const invalidDateRows = [];
      const invalidPriceRows = [];

      // Build DTOs for bulk insert
      const dto = resolved.map((r, idx) => {
        const eff = normalizeExcelDate(r.effective_date_raw, { date1904 });
        if (!eff) invalidDateRows.push(idx + 2); // +2 to account for header row and 1-based indexing
        const price = normalizeUnitPrice(r.unit_price_raw);
        if (price === null) invalidPriceRows.push(idx + 2);
        return {
          tenant_code: user.tenant_code,
          created_by: user.user_name,
          vendor_sku_id: vendorSkuMap.get(vendorSkuKey(vendorCodeMap[r.vendor_code], r.vendor_sku)),
          unit_price: price,
          unit: coerceUnit(r.unit),
          effective_date: eff,
        };
      });

      // If any invalid rows detected, return 400 with debug context
      if (invalidDateRows.length > 0 || invalidPriceRows.length > 0) {
        const msgs = [];
        if (invalidDateRows.length) msgs.push(`Invalid effective_date rows: ${invalidDateRows.slice(0, 5).join(', ')}${invalidDateRows.length > 5 ? '...' : ''}`);
        if (invalidPriceRows.length) msgs.push(`Invalid unit_price rows: ${invalidPriceRows.slice(0, 5).join(', ')}${invalidPriceRows.length > 5 ? '...' : ''}`);
        // Include debug snapshot to help identify header/value issues
        const debugSample = resolved.slice(0, 2);
        const originalHeaders = Object.keys(rows[0] || {});
        return res.status(400).json({ error: msgs.join(' | '), debug: { headers: originalHeaders, sample: debugSample } });
      }

      // Persist directly via the model to avoid double responses from BaseController.bulkInsert
      const insertedCount = await this.model(schema).bulkInsert(dto);
      return res.status(200).json({ message: `${insertedCount} vendor prices inserted` });
    } catch (err) {
      // Log error details and return generic 500 (only if not already sent)
      logger.error('Error importing vendor pricing XLS:', { message: err.message, stack: err.stack });
      if (!res.headersSent) {
        return res.status(500).json({
          message: 'Failed to import vendor pricing XLS file',
          error: err.message || 'Unknown error',
        });
      }
      // If headers already sent, just end the handler
      return;
    }
  }
}

const instance = new VendorPricingController();

export default instance; // Use in production and development environments
export { VendorPricingController }; // Use in test environment
