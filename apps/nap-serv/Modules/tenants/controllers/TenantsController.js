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
import { handleError } from '../../../src/utils/BaseController.js';
import db from '../../../src/db/db.js';
import logger from '../../../src/utils/logger.js';

class TenantsController extends BaseController {
  constructor() {
    super('tenants');
  }

  // Soft delete tenant by marking it as inactive.  Also marks all associated active users as inactive.
  async remove(req, res) {
    logger.info(`[TenantController] remove`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });

    req.body.deactivated_at = new Date();
    // const filters = [{ deactivated_at: { $is: null } }, { ...req.query }];

    try {
      let count = await this.model.updateWhere(req.query, req.body);
      if (!count) return res.status(404).json({ error: `${this.errorLabel} not found or tenant is already inactive` });

      count = await db('napUsers', 'admin').updateWhere(req.query, req.body);
      res.status(200).json({ message: `${this.errorLabel} marked as inactive` });
    } catch (err) {
      handleError(err, res, 'deleting', this.errorLabel);
    }
  }

  async restore(req, res) {
    req.body.deactivated_at = null;

    const filters = [{ deactivated_at: { $not: null } }, { ...req.query }];

    try {
      let count = await this.model.updateWhere(filters, req.body, { includeDeactivated: true });
      if (!count) return res.status(404).json({ error: `${this.errorLabel} not found or tenant is already active` });

      filters.unshift({ updated_at: { $max: true } });

      count = await db('napUsers', 'admin').updateWhere(filters, req.body, { includeDeactivated: true });
      if (!count) return res.status(404).json({ error: `${this.errorLabel} no users found` });

      res.status(200).json({ message: `${this.errorLabel} marked as active` });
    } catch (err) {
      handleError(err, res, 'deleting', this.errorLabel);
    }
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
