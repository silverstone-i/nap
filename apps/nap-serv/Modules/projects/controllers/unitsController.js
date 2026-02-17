/**
 * @file Units controller — CRUD with template-based creation
 * @module projects/controllers/unitsController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';
import { instantiateFromTemplate } from '../services/templateService.js';

class UnitsController extends BaseController {
  constructor() {
    super('units', 'unit');
  }

  async create(req, res) {
    try {
      const schema = this.getSchema(req);
      const record = await this.model(schema).insert(req.body);

      // If a template_unit_id was provided, copy template tasks and cost items
      if (req.body.template_unit_id) {
        await instantiateFromTemplate(schema, record.id, req.body.template_unit_id, req.body.created_by);
      }

      res.status(201).json(record);
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') err.message = 'Invalid input data';
      this.handleError(err, res, 'creating', this.errorLabel);
    }
  }
}

const instance = new UnitsController();
export default instance;
export { UnitsController };
