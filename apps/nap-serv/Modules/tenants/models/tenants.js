'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { TableModel } from 'pg-schemata';
import tenantsSchema from '../schemas/tenantsSchema.js';

class Tenants extends TableModel {
  constructor(db, pgp) {
    super(db, pgp, tenantsSchema);
  }

  async getAllowedModulesById(tenantId) {
    const tenant = await this.findById(tenantId);
    if (!tenant) return null;
    return tenant.allowed_modules;
  }
}

export default Tenants;
