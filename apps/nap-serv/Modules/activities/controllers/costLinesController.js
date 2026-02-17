/**
 * @file CostLines controller — CRUD with source_type validation and status transitions
 * @module activities/controllers/costLinesController
 *
 * Status workflow: draft -> locked -> change_order
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

const VALID_SOURCE_TYPES = ['material', 'labor'];

const VALID_TRANSITIONS = {
  draft: ['locked'],
  locked: ['change_order'],
  change_order: [],
};

function validateSourceType(body) {
  if (body.source_type && !VALID_SOURCE_TYPES.includes(body.source_type)) {
    return `Invalid source_type: ${body.source_type}. Must be one of: ${VALID_SOURCE_TYPES.join(', ')}`;
  }
  return null;
}

class CostLinesController extends BaseController {
  constructor() {
    super('costLines', 'cost-line');
  }

  async create(req, res) {
    const err = validateSourceType(req.body);
    if (err) return res.status(400).json({ error: err });

    if (req.body.status && !VALID_TRANSITIONS[req.body.status]) {
      return res.status(400).json({ error: `Invalid cost line status: ${req.body.status}` });
    }
    return super.create(req, res);
  }

  async update(req, res) {
    const err = validateSourceType(req.body);
    if (err) return res.status(400).json({ error: err });

    if (req.body.status) {
      try {
        const schema = this.getSchema(req);
        const id = req.query.id;
        if (id) {
          const current = await this.model(schema).findById(id);
          if (!current) return res.status(404).json({ error: 'cost-line not found' });

          const allowed = VALID_TRANSITIONS[current.status];
          if (!allowed || !allowed.includes(req.body.status)) {
            return res.status(400).json({
              error: `Invalid status transition: ${current.status} → ${req.body.status}`,
            });
          }
        }
      } catch (err2) {
        return this.handleError(err2, res, 'validating status for', this.errorLabel);
      }
    }
    return super.update(req, res);
  }
}

const instance = new CostLinesController();
export default instance;
export { CostLinesController, VALID_SOURCE_TYPES, VALID_TRANSITIONS };
