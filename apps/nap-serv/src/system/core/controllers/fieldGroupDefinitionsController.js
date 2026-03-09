/**
 * @file Field group definitions controller — CRUD for RBAC Layer 4 column groups
 * @module core/controllers/fieldGroupDefinitionsController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class FieldGroupDefinitionsController extends BaseController {
  constructor() {
    super('fieldGroupDefinitions');
  }

  /**
   * DELETE /archive — hard-delete (table has softDelete: false, no deactivated_at column).
   * Associated field_group_grants are removed by ON DELETE CASCADE.
   */
  async archive(req, res) {
    try {
      const filters = Array.isArray(req.query) ? req.query : [{ ...req.query }];
      const count = await this.model(this.getSchema(req)).deleteWhere(filters);
      if (!count) return res.status(404).json({ error: `${this.errorLabel} not found` });
      res.status(200).json({ message: `${this.errorLabel} deleted` });
    } catch (err) {
      this.handleError(err, res, 'deleting', this.errorLabel);
    }
  }
}

const instance = new FieldGroupDefinitionsController();
export default instance;
export { FieldGroupDefinitionsController };
