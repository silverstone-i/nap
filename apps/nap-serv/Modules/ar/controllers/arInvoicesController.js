/**
 * @file AR Invoices controller — CRUD with status workflow and GL posting hooks
 * @module ar/controllers/arInvoicesController
 *
 * Status workflow: open → sent → paid → voided
 * On sending: GL journal entry (debit AR, credit Revenue)
 * project_id links invoice to project for profitability tracking.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';
import { postARInvoice } from '../../accounting/services/postingService.js';
import logger from '../../../src/utils/logger.js';

const VALID_TRANSITIONS = {
  open: ['sent', 'voided'],
  sent: ['paid', 'voided'],
  paid: ['voided'],
  voided: [],
};

class ArInvoicesController extends BaseController {
  constructor() {
    super('arInvoices', 'ar-invoice');
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
          if (!current) return res.status(404).json({ error: 'ar-invoice not found' });

          const allowed = VALID_TRANSITIONS[current.status];
          if (!allowed || !allowed.includes(req.body.status)) {
            return res.status(400).json({
              error: `Invalid status transition: ${current.status} → ${req.body.status}`,
            });
          }

          // On sending: create GL journal entry (debit AR, credit Revenue)
          if (req.body.status === 'sent') {
            try {
              await postARInvoice(schema, current, {
                arReceivableAccountId: req.body.ar_receivable_account_id || current.ar_receivable_account_id,
                revenueAccountId: req.body.revenue_account_id || current.revenue_account_id,
              });
            } catch (glErr) {
              logger.error(`GL posting failed for AR Invoice ${id}: ${glErr.message}`);
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

const instance = new ArInvoicesController();
export default instance;
export { ArInvoicesController, VALID_TRANSITIONS };
