/**
 * @file Vendors model — extends TableModel with custom lookup methods
 * @module core/models/Vendors
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import vendorsSchema from '../schemas/vendorsSchema.js';

export default class Vendors extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, vendorsSchema, logger);
  }

  /**
   * Find a vendor by tenant and code.
   * @param {string} tenantId Tenant UUID
   * @param {string} code Vendor code
   * @returns {Promise<object|null>}
   */
  async findByCode(tenantId, code) {
    return this.findOneBy([{ tenant_id: tenantId, code }]);
  }
}
