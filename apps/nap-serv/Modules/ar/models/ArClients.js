/**
 * @file ArClients model — extends TableModel with custom findByCode lookup
 * @module ar/models/ArClients
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import arClientsSchema from '../schemas/arClientsSchema.js';

export default class ArClients extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, arClientsSchema, logger);
  }

  /**
   * Find a client by tenant_id and client_code.
   * @param {string} tenantId
   * @param {string} clientCode
   * @returns {Promise<object|null>}
   */
  async findByCode(tenantId, clientCode) {
    return this.findOneBy([{ tenant_id: tenantId, client_code: clientCode }]);
  }
}
