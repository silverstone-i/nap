/**
 * @file ActualCosts controller — CRUD with approval workflow and budget tolerance checks
 * @module activities/controllers/actualCostsController
 *
 * Approval workflow: pending -> approved | rejected
 * Validation: amounts checked against approved budget + tolerance.
 * Approval triggers GL posting (debit Expense/WIP, credit AP/Accrual).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';
import { postActualCost } from '../../accounting/services/postingService.js';
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

          // On approval: create GL journal entry (debit Expense/WIP, credit AP/Accrual)
          if (req.body.approval_status === 'approved') {
            try {
              await postActualCost(schema, current, {
                expenseAccountId: req.body.expense_account_id || current.expense_account_id,
                accrualAccountId: req.body.accrual_account_id || current.accrual_account_id,
                companyId: current.company_id,
                tenantId: current.tenant_id,
              });
            } catch (glErr) {
              logger.error(`GL posting failed for Actual Cost ${id}: ${glErr.message}`);
            }
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
