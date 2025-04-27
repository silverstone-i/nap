'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import {BaseModel} from 'pg-schemata';
import tenantSchema from '../schemas/tenantSchema.js';

class Tenants extends BaseModel {
  constructor(db, pgp) {
    super(db, pgp, tenantSchema);
  }

  async getAllowedModulesById(tenantId) {
    const tenant = await this.findById(tenantId);
    if (!tenant) return null;
    return tenant.allowed_modules;
  }
}

export default Tenants;