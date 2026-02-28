/**
 * @file Payments controller — CRUD with method validation, computed balance tracking, and GL hooks
 * @module ap/controllers/paymentsController
 *
 * Records payments against AP invoices. Supports partial payments.
 * Remaining balance is computed from total_amount − SUM(payments) − SUM(applied credits).
 * On full payment: auto-transitions invoice status to 'paid'.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import db from '../../../db/db.js';
import { postAPPayment } from '../../accounting/services/postingService.js';
import logger from '../../../lib/logger.js';

const VALID_METHODS = ['check', 'ach', 'wire'];

/**
 * Computes the remaining balance for an AP invoice.
 * remaining = total_amount − SUM(payments) − SUM(applied credit memos)
 * @param {string} schema - Tenant schema name
 * @param {string} invoiceId - AP invoice UUID
 * @returns {Promise<number>} Remaining balance
 */
async function computeRemainingBalance(schema, invoiceId) {
  const row = await db.one(
    `
    SELECT
      i.total_amount
        - COALESCE((SELECT SUM(p.amount) FROM ${schema}.payments p
                    WHERE p.ap_invoice_id = $1 AND p.deactivated_at IS NULL), 0)
        - COALESCE((SELECT SUM(cm.amount) FROM ${schema}.ap_credit_memos cm
                    WHERE cm.ap_invoice_id = $1 AND cm.status = 'applied'
                      AND cm.deactivated_at IS NULL), 0)
      AS remaining
    FROM ${schema}.ap_invoices i
    WHERE i.id = $1
    `,
    [invoiceId],
  );
  return parseFloat(row.remaining) || 0;
}

class PaymentsController extends BaseController {
  constructor() {
    super('payments', 'payment');
  }

  async create(req, res) {
    if (req.body.method && !VALID_METHODS.includes(req.body.method)) {
      return res.status(400).json({
        error: `Invalid payment method: ${req.body.method}. Must be one of: ${VALID_METHODS.join(', ')}`,
      });
    }

    const invoiceId = req.body.ap_invoice_id;
    const paymentAmount = parseFloat(req.body.amount) || 0;

    if (invoiceId && paymentAmount > 0) {
      try {
        const schema = this.getSchema(req);
        const invoice = await db('apInvoices', schema).findById(invoiceId);
        if (!invoice) {
          return res.status(400).json({ error: 'Referenced AP invoice not found' });
        }
        if (invoice.status === 'voided') {
          return res.status(400).json({ error: 'Cannot pay a voided invoice' });
        }
        if (invoice.status === 'open') {
          return res.status(400).json({ error: 'Invoice must be approved before payment' });
        }
        const currentBalance = await computeRemainingBalance(schema, invoiceId);
        if (paymentAmount > currentBalance) {
          return res.status(400).json({
            error: `Payment amount ${paymentAmount} exceeds remaining balance ${currentBalance}`,
          });
        }
      } catch (err) {
        return this.handleError(err, res, 'validating invoice for', this.errorLabel);
      }
    }

    const result = await super.create(req, res);

    if (invoiceId && paymentAmount > 0 && res.statusCode === 201) {
      try {
        const schema = this.getSchema(req);
        const invoice = await db('apInvoices', schema).findById(invoiceId);
        const newBalance = await computeRemainingBalance(schema, invoiceId);

        if (newBalance <= 0) {
          await db.none(
            `UPDATE ${schema}.ap_invoices SET status = 'paid' WHERE id = $1`,
            [invoiceId],
          );
          logger.info(`AP Invoice ${invoiceId} fully paid`);
        }

        try {
          await postAPPayment(schema, {
            ...req.body, id: res.body?.id,
            tenant_id: invoice.tenant_id, company_id: invoice.company_id,
            payment_date: req.body.payment_date || new Date().toISOString().split('T')[0],
          }, {
            apLiabilityAccountId: req.body.ap_liability_account_id,
            cashAccountId: req.body.cash_account_id,
            companyId: invoice.company_id,
          });
        } catch (glErr) {
          logger.error(`GL posting failed for AP Payment on Invoice ${invoiceId}: ${glErr.message}`);
        }
      } catch (err) {
        logger.error(`Failed to update invoice status after payment: ${err.message}`);
      }
    }

    return result;
  }

  async update(req, res) {
    if (req.body.method && !VALID_METHODS.includes(req.body.method)) {
      return res.status(400).json({
        error: `Invalid payment method: ${req.body.method}. Must be one of: ${VALID_METHODS.join(', ')}`,
      });
    }
    return super.update(req, res);
  }
}

const instance = new PaymentsController();
export default instance;
export { PaymentsController, VALID_METHODS, computeRemainingBalance };
