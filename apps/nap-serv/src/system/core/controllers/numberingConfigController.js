/**
 * @file Numbering config controller — CRUD for tenant numbering configuration
 * @module core/controllers/numberingConfigController
 *
 * Overrides update() to detect when numbering is enabled for an entity type
 * and backfill codes on existing records that have code IS NULL.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import db from '../../../db/db.js';
import { backfillCodes } from '../services/numberingService.js';

class NumberingConfigController extends BaseController {
  constructor() {
    super('tenantNumberingConfig');
    this.rbacConfig = {
      module: 'core',
      router: 'numbering-config',
    };
  }

  async update(req, res) {
    try {
      const schema = this.getSchema(req);
      const model = this.model(schema);
      const configId = req.query.id;

      // Read current state to detect is_enabled transition
      const before = await model.findById(configId);
      if (!before) return res.status(404).json({ error: 'Numbering config not found' });

      const count = await model.updateWhere([{ id: configId }], req.body);
      if (!count) return res.status(404).json({ error: 'Numbering config not found' });

      // Backfill when is_enabled transitions false → true
      let backfilledCodes = 0;
      if (!before.is_enabled && req.body.is_enabled === true) {
        backfilledCodes = await db.tx(async (t) => backfillCodes(schema, before.id_type, t));
      }

      res.json({ updatedRecords: count, backfilledCodes });
    } catch (err) {
      this.handleError(err, res, 'updating', this.errorLabel);
    }
  }
}

const instance = new NumberingConfigController();
export default instance;
export { NumberingConfigController };
