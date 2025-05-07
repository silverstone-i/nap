'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { db } from '../../../src/db/db.js';
import { createController, handleError } from '../../../src/utils/createController.js';

const TenantsController = createController('tenants', {
  async getAllAllowedModules(req, res) {
    console.log('Model Name:', 'tenants');
    console.log('Fetching allowed modules for tenant ID:', req.params.id);

    try {
      const allowedModules = await db.tenants.getAllowedModulesById(req.params.id);
      if (!allowedModules) {
        return res.status(404).json({ error: 'Tenant not found' });
      }
      res.json({ allowed_modules: allowedModules });
    } catch (err) {
      handleError(err, res, 'fetching allowed modules', 'Tenants');
    }
  }
}, 'Tenants');

export default TenantsController;
