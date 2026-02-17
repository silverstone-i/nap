/**
 * @file VendorSkus model — extends TableModel with SKU lookup and embedding methods
 * @module bom/models/VendorSkus
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import vendorSkusSchema from '../schemas/vendorSkusSchema.js';

export default class VendorSkus extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, vendorSkusSchema, logger);
  }

  /**
   * Look up a vendor SKU by vendor + SKU code.
   * @param {string} vendorId Vendor UUID
   * @param {string} vendorSku SKU code string
   * @returns {Promise<object|null>}
   */
  async findBySku(vendorId, vendorSku) {
    return this.findOneBy([{ vendor_id: vendorId, vendor_sku: vendorSku }]);
  }

  /**
   * Find all vendor SKUs that have not been matched to a catalog SKU.
   * @returns {Promise<object[]>}
   */
  async getUnmatched() {
    const schema = this.schemaName;
    const table = this.tableName;
    return this.db.manyOrNone(
      `SELECT * FROM ${schema}.${table} WHERE catalog_sku_id IS NULL AND deactivated_at IS NULL ORDER BY created_at DESC`,
    );
  }

  /**
   * Batch update embedding vectors via raw SQL (pg-schemata skips vector columns).
   * @param {{ id: string, embedding: number[] }[]} batches Array of { id, embedding }
   */
  async refreshEmbeddings(batches) {
    const schema = this.schemaName;
    const table = this.tableName;
    for (const { id, embedding } of batches) {
      const vecString = `[${embedding.join(',')}]`;
      await this.db.none(
        `UPDATE ${schema}.${table} SET embedding = $1::vector WHERE id = $2`,
        [vecString, id],
      );
    }
  }
}
