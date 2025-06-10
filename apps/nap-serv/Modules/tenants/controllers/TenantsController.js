'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import BaseController from '../../../src/utils/BaseController.js';

class TenantsController extends BaseController {
  constructor() {
    super('tenants');
  }

  async getAllAllowedModules(req, res) {
    try {
      const allowedModules = await this.model.getAllowedModulesById(req.params.id);
      if (!allowedModules) {
        return res.status(404).json({ error: 'Tenant not found' });
      }
      res.json({ allowed_modules: allowedModules });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

const instance = new TenantsController();

export { TenantsController }; // Export the class for testing purposes
export default instance; // Export the instance for use in development and production
// This allows for both testing and direct usage of the controller
// without needing to create a new instance each time.
// This is useful for maintaining a singleton pattern for the controller
// while still allowing for testing flexibility.
