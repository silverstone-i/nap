/**
 * @file Clients model — extends TableModel with custom lookup methods
 * @module core/models/Clients
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import clientsSchema from '../schemas/clientsSchema.js';

export default class Clients extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, clientsSchema, logger);
  }

  /**
   * Find a client by tenant and code.
   * @param {string} tenantId Tenant UUID
   * @param {string} code Client code
   * @returns {Promise<object|null>}
   */
  async findByCode(tenantId, code) {
    return this.findOneBy([{ tenant_id: tenantId, code }]);
  }
}
