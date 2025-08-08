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

      // Resolve flexible header names per row (supports varied labels like "Unit Price ($)")
      const normalizeKey = k =>
        String(k)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
      const getField = (row, candidates) => {
        const keys = Object.keys(row);
        const normMap = new Map(keys.map(k => [normalizeKey(k), k]));
        // 1) Exact normalized match
        for (const c of candidates) {
          const hit = normMap.get(normalizeKey(c));
          if (hit !== undefined) return row[hit];
        }
        // 2) Fuzzy includes: if header contains any candidate token
        const wanted = candidates.map(c => normalizeKey(c));
        for (const [normK, origK] of normMap.entries()) {
          if (wanted.some(w => normK.includes(w) || w.includes(normK))) {
            return row[origK];
          }
        }
        return undefined;
      };

      // Normalize raw rows to a consistent shape used by downstream logic
      const resolved = rows.map(r => {
        const vendor_code = getField(r, ['vendor_code', 'vendor code', 'Vendor Code', 'VendorCode']);
        const vendor_sku = getField(r, ['vendor_sku', 'vendor sku', 'Vendor SKU', 'VendorSku', 'sku']);
        const unit_price_raw = getField(r, ['unit_price', 'unit price', 'Unit Price', 'price', 'cost']);
        const unit = getField(r, ['unit', 'Unit', 'uom', 'UOM']);
        const effective_date_raw = getField(r, ['effective_date', 'effective date', 'Effective Date', 'date', 'Date']);
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

      // Helpers to normalize Excel date values (Date objects, serials, strings)
      const excelSerialToDate = (serial, isDate1904 = false) => {
        // Excel's day 1 is 1899-12-31 (actually 1899-12-30 due to the 1900 leap year bug)
        // Using 1899-12-30 as base aligns most serial values correctly
        const base = Date.UTC(1899, 11, 30);
        let days = Number(serial);
        if (!Number.isFinite(days)) return null;
        if (isDate1904) {
          // Shift for 1904 date system (difference between systems)
          days += 1462;
        }
        const ms = base + Math.round(days * 86400 * 1000);
        return new Date(ms);
      };

      const normalizeExcelDate = val => {
        if (!val && val !== 0) return null;
        if (typeof val === 'object' && val !== null) {
          if (Object.prototype.hasOwnProperty.call(val, 'result')) return normalizeExcelDate(val.result);
          if (Object.prototype.hasOwnProperty.call(val, 'text')) return normalizeExcelDate(val.text);
          if (Array.isArray(val.richText)) return normalizeExcelDate(val.richText.map(rt => rt.text || '').join(''));
        }
        if (val instanceof Date) {
          return val.toISOString().slice(0, 10);
        }
        if (typeof val === 'number') {
          const d = excelSerialToDate(val, date1904);
          return d ? d.toISOString().slice(0, 10) : null;
        }
        if (typeof val === 'string') {
          // Fast-path ISO-like date strings
          const isoLike = /^\d{4}-\d{2}-\d{2}$/;
          if (isoLike.test(val)) return val;

          // Try parsing common formats; avoid time
          const parsed = new Date(val);
          if (!isNaN(parsed.getTime())) {
            return parsed.toISOString().slice(0, 10);
          }
          // Numeric-as-string (serial)
          const asNum = Number(val);
          if (Number.isFinite(asNum)) {
            const d = excelSerialToDate(asNum, date1904);
            return d ? d.toISOString().slice(0, 10) : null;
          }
          return null;
        }
        return null;
      };

      // Pre-validate and convert date and unit_price fields
      const invalidDateRows = [];
      const invalidPriceRows = [];

      const normalizeUnitPrice = val => {
        if (val === null || val === undefined || val === '') return null;
        if (typeof val === 'number' && Number.isFinite(val)) return val;
        if (typeof val === 'object' && val !== null) {
          if (Object.prototype.hasOwnProperty.call(val, 'result')) return normalizeUnitPrice(val.result);
          if (Object.prototype.hasOwnProperty.call(val, 'text')) return normalizeUnitPrice(val.text);
          if (Array.isArray(val.richText)) return normalizeUnitPrice(val.richText.map(rt => rt.text || '').join(''));
        }
        if (typeof val === 'string') {
          let s = val.trim();
          if (s === '-' || s === '—') return 0;
          // Keep digits, separators, minus, and parentheses; strip currency and text
          s = s.replace(/[^0-9,\.\-()]/g, '');
          let negative = false;
          if (s.startsWith('(') && s.endsWith(')')) {
            negative = true;
            s = s.slice(1, -1);
          }
          const hasComma = s.includes(',');
          const hasDot = s.includes('.');
          if (hasComma && hasDot) {
            // Determine decimal separator by last occurrence
            if (s.lastIndexOf('.') > s.lastIndexOf(',')) {
              // Dot is decimal, remove thousands commas
              s = s.replace(/,/g, '');
            } else {
              // Comma is decimal, remove thousands dots then convert comma to dot
              s = s.replace(/\./g, '');
              s = s.replace(',', '.');
            }
          } else if (hasComma && !hasDot) {
            // Likely comma decimal; convert to dot
            s = s.replace(',', '.');
          } // else: dot or none already fine

          const num = Number(s);
          if (!Number.isFinite(num)) return null;
          return negative ? -num : num;
        }
        return null;
      };
      const coerceUnit = v => {
        if (v === null || v === undefined) return v;
        if (typeof v === 'string') return v.trim();
        if (typeof v === 'number') return String(v);
        if (typeof v === 'object') {
          if (Object.prototype.hasOwnProperty.call(v, 'text')) return String(v.text).trim();
          if (Object.prototype.hasOwnProperty.call(v, 'result')) return String(v.result).trim();
          if (Array.isArray(v.richText))
            return v.richText
              .map(rt => rt.text || '')
              .join('')
              .trim();
        }
        return String(v).trim();
      };

      // Build DTOs for bulk insert
      const dto = resolved.map((r, idx) => {
        const eff = normalizeExcelDate(r.effective_date_raw);
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
