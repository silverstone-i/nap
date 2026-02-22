/**
 * @file Tenants model — extends TableModel for admin.tenants
 * @module auth/models/Tenants
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import tenantsSchema from '../schemas/tenantsSchema.js';

export default class Tenants extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, tenantsSchema, logger);
  }

  async getAllowedModulesById(tenantId) {
    const tenant = await this.findById(tenantId);
    if (!tenant) return null;
    return tenant.allowed_modules;
  }
}
