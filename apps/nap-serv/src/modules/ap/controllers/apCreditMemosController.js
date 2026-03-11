/**
 * @file AP Credit Memos controller — CRUD with status workflow
 * @module ap/controllers/apCreditMemosController
 *
 * Status workflow: open → applied → voided
 * Applied credit memos reduce the linked invoice's remaining balance.
 * When remaining balance reaches zero, invoice auto-transitions to 'paid'.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import db, { pgp } from '../../../db/db.js';
import { computeRemainingBalance } from './paymentsController.js';
import logger from '../../../lib/logger.js';

const VALID_TRANSITIONS = {
  open: ['applied', 'voided'],
  applied: ['voided'],
  voided: [],
};

class ApCreditMemosController extends BaseController {
  constructor() {
    super('apCreditMemos', 'ap-credit-memo');
    this.rbacConfig = { module: 'ap', router: 'ap-credit-memos' };
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

          if (req.body.status === 'applied' && current.ap_invoice_id) {
            logger.info(`Credit memo ${id} applied to invoice ${current.ap_invoice_id}`);

            // Check if invoice is now fully paid after this credit is applied
            // (the credit memo record is already updated by super.update below,
            //  so we compute after the base update)
          }
        }
      } catch (err) {
        return this.handleError(err, res, 'validating status for', this.errorLabel);
      }
    }

    const result = await super.update(req, res);

    // After update: check if the linked invoice is now fully paid
    if (req.body.status === 'applied' && res.statusCode === 200) {
      try {
        const schema = this.getSchema(req);
        const s = pgp.as.name(schema);
        const id = req.query.id;
        const current = await this.model(schema).findById(id);
        if (current?.ap_invoice_id) {
          const remaining = await computeRemainingBalance(schema, current.ap_invoice_id);
          if (remaining <= 0) {
            await db.none(
              `UPDATE ${s}.ap_invoices SET status = 'paid' WHERE id = $1`,
              [current.ap_invoice_id],
            );
            logger.info(`AP Invoice ${current.ap_invoice_id} fully paid after credit memo ${id}`);
          }
        }
      } catch (err) {
        logger.error(`Failed to check invoice balance after credit memo: ${err.message}`);
      }
    }

    return result;
  }
}

const instance = new ApCreditMemosController();
export default instance;
export { ApCreditMemosController };
