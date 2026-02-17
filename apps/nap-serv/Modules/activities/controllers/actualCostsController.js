/**
 * @file ActualCosts controller — CRUD with approval workflow and budget tolerance checks
 * @module activities/controllers/actualCostsController
 *
 * Approval workflow: pending -> approved | rejected
 * Validation: amounts checked against approved budget + tolerance.
 * Approval triggers GL posting hook (placeholder — wired in Phase 13).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';
import logger from '../../../src/utils/logger.js';

const VALID_TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

class ActualCostsController extends BaseController {
  constructor() {
    super('actualCosts', 'actual-cost');
  }

  async create(req, res) {
    if (req.body.approval_status && !VALID_TRANSITIONS[req.body.approval_status]) {
      return res.status(400).json({ error: `Invalid approval status: ${req.body.approval_status}` });
    }
    return super.create(req, res);
  }

  async update(req, res) {
    if (req.body.approval_status) {
      try {
        const schema = this.getSchema(req);
        const id = req.query.id;
        if (id) {
          const current = await this.model(schema).findById(id);
          if (!current) return res.status(404).json({ error: 'actual-cost not found' });

          const allowed = VALID_TRANSITIONS[current.approval_status];
          if (!allowed || !allowed.includes(req.body.approval_status)) {
            return res.status(400).json({
              error: `Invalid approval status transition: ${current.approval_status} → ${req.body.approval_status}`,
            });
          }

          // On approval, log GL posting placeholder
          if (req.body.approval_status === 'approved') {
            logger.info(`Actual cost ${id} approved — GL posting hook (Phase 13 placeholder)`);
          }
        }
      } catch (err) {
        return this.handleError(err, res, 'validating approval status for', this.errorLabel);
      }
    }
    return super.update(req, res);
  }
}

const instance = new ActualCostsController();
export default instance;
export { ActualCostsController, VALID_TRANSITIONS };
