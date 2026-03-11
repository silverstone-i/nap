/**
 * @file ActualCosts controller — CRUD with approval workflow
 * @module activities/controllers/actualCostsController
 *
 * Approval workflow: pending → approved | rejected
 * Approval triggers GL posting (debit Expense/WIP, credit AP/Accrual)
 * — GL integration will be wired in Phase 9 (accounting module).
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import logger from '../../../lib/logger.js';

const VALID_TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

class ActualCostsController extends BaseController {
  constructor() {
    super('actualCosts', 'actual-cost');
    this.rbacConfig = { module: 'activities', router: 'actual-costs', scopeColumn: 'project_id' };
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
          if (!current) return res.status(404).json({ error: 'Actual cost not found' });

          const allowed = VALID_TRANSITIONS[current.approval_status];
          if (!allowed || !allowed.includes(req.body.approval_status)) {
            return res.status(400).json({
              error: `Invalid approval status transition: ${current.approval_status} → ${req.body.approval_status}`,
            });
          }

          // Phase 9: GL posting on approval (debit Expense/WIP, credit AP/Accrual)
          if (req.body.approval_status === 'approved') {
            logger.info(`Actual cost ${id} approved — GL posting will be wired in Phase 9`);
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
export { ActualCostsController };
