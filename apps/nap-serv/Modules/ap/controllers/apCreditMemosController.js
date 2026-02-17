/**
 * @file AP Credit Memos controller — CRUD with status workflow
 * @module ap/controllers/apCreditMemosController
 *
 * Status workflow: open → applied → voided
 * Applied credit memos reduce the linked invoice's balance_due.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';
import db from '../../../src/db/db.js';
import logger from '../../../src/utils/logger.js';

const VALID_TRANSITIONS = {
  open: ['applied', 'voided'],
  applied: ['voided'],
  voided: [],
};

class ApCreditMemosController extends BaseController {
  constructor() {
    super('apCreditMemos', 'ap-credit-memo');
  }

  async create(req, res) {
    if (req.body.status && !VALID_TRANSITIONS[req.body.status]) {
      return res.status(400).json({ error: `Invalid credit memo status: ${req.body.status}` });
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
          if (!current) return res.status(404).json({ error: 'ap-credit-memo not found' });

          const allowed = VALID_TRANSITIONS[current.status];
          if (!allowed || !allowed.includes(req.body.status)) {
            return res.status(400).json({
              error: `Invalid status transition: ${current.status} → ${req.body.status}`,
            });
          }

          // On applying: reduce the invoice's balance_due
          if (req.body.status === 'applied' && current.ap_invoice_id) {
            const creditAmount = parseFloat(current.amount) || 0;
            const invoice = await db('apInvoices', schema).findById(current.ap_invoice_id);
            if (invoice) {
              const newBalance = Math.max(0, parseFloat(invoice.balance_due) - creditAmount);
              await db.none(
                `UPDATE ${schema}.ap_invoices SET balance_due = $1 WHERE id = $2`,
                [newBalance, current.ap_invoice_id],
              );
              logger.info(`Credit memo ${id} applied — reduced invoice ${current.ap_invoice_id} balance by ${creditAmount}`);
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

const instance = new ApCreditMemosController();
export default instance;
export { ApCreditMemosController, VALID_TRANSITIONS };
