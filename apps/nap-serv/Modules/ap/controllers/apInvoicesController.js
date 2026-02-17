/**
 * @file AP Invoices controller — CRUD with status workflow and GL posting hooks
 * @module ap/controllers/apInvoicesController
 *
 * Status workflow: open → approved → paid → voided
 * On approval: GL journal entry (debit Expense/WIP, credit AP Liability)
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';
import { postAPInvoice } from '../../accounting/services/postingService.js';
import logger from '../../../src/utils/logger.js';

const VALID_TRANSITIONS = {
  open: ['approved', 'voided'],
  approved: ['paid', 'voided'],
  paid: ['voided'],
  voided: [],
};

class ApInvoicesController extends BaseController {
  constructor() {
    super('apInvoices', 'ap-invoice');
  }

  async create(req, res) {
    if (req.body.status && !VALID_TRANSITIONS[req.body.status]) {
      return res.status(400).json({ error: `Invalid invoice status: ${req.body.status}` });
    }
    // Initialize balance_due to total_amount if not provided
    if (req.body.total_amount && !req.body.balance_due) {
      req.body.balance_due = req.body.total_amount;
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
          if (!current) return res.status(404).json({ error: 'ap-invoice not found' });

          const allowed = VALID_TRANSITIONS[current.status];
          if (!allowed || !allowed.includes(req.body.status)) {
            return res.status(400).json({
              error: `Invalid status transition: ${current.status} → ${req.body.status}`,
            });
          }

          // On approval: create GL journal entry (debit Expense/WIP, credit AP Liability)
          if (req.body.status === 'approved') {
            try {
              await postAPInvoice(schema, current, {
                expenseAccountId: req.body.expense_account_id || current.expense_account_id,
                apLiabilityAccountId: req.body.ap_liability_account_id || current.ap_liability_account_id,
              });
            } catch (glErr) {
              logger.error(`GL posting failed for AP Invoice ${id}: ${glErr.message}`);
              // Non-blocking: invoice still transitions, GL error logged
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

const instance = new ApInvoicesController();
export default instance;
export { ApInvoicesController, VALID_TRANSITIONS };
