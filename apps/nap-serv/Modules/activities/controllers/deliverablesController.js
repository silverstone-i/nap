/**
 * @file Deliverables controller — CRUD with status workflow enforcement
 * @module activities/controllers/deliverablesController
 *
 * Status workflow: pending -> released -> finished -> canceled
 * A deliverable cannot be released without an approved budget.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';
import db from '../../../src/db/db.js';

const VALID_TRANSITIONS = {
  pending: ['released', 'canceled'],
  released: ['finished', 'canceled'],
  finished: [],
  canceled: [],
};

class DeliverablesController extends BaseController {
  constructor() {
    super('deliverables', 'deliverable');
  }

  async create(req, res) {
    if (req.body.status && !VALID_TRANSITIONS[req.body.status]) {
      return res.status(400).json({ error: `Invalid deliverable status: ${req.body.status}` });
    }
    return super.create(req, res);
  }

  async update(req, res) {
    if (req.body.status) {
      try {
        const schema = this.getSchema(req);
        const id = req.query.id;
        if (id) {
          const current = await this.model(schema).findById(id);
          if (!current) return res.status(404).json({ error: 'deliverable not found' });

          const allowed = VALID_TRANSITIONS[current.status];
          if (!allowed || !allowed.includes(req.body.status)) {
            return res.status(400).json({
              error: `Invalid status transition: ${current.status} → ${req.body.status}`,
            });
          }

          // Deliverable cannot be released without an approved budget
          if (req.body.status === 'released') {
            const budgets = await db('budgets', schema).findWhere([
              { deliverable_id: id, status: 'approved', is_current: true },
            ]);
            if (!budgets || budgets.length === 0) {
              return res.status(400).json({
                error: 'Cannot release deliverable: no approved budget exists',
              });
            }
          }
        }
      } catch (err) {
        return this.handleError(err, res, 'validating status for', this.errorLabel);
      }
    }
    return super.update(req, res);
  }
}

const instance = new DeliverablesController();
export default instance;
export { DeliverablesController, VALID_TRANSITIONS };
