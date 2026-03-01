/**
 * @file Receipts controller — CRUD with method validation, computed balance, and GL hooks
 * @module ar/controllers/receiptsController
 *
 * Records receipts against AR invoices. Supports partial payments.
 * Remaining balance is computed as total_amount − SUM(receipts).
 * On receipt: auto-transitions invoice to 'paid' when fully settled, creates GL entry.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import db from '../../../db/db.js';
import { postARReceipt } from '../../accounting/services/index.js';
import logger from '../../../lib/logger.js';

const VALID_METHODS = ['check', 'ach', 'wire'];

/**
 * Compute remaining balance for an AR invoice:
 *   total_amount − SUM(receipts)
 */
async function computeRemainingBalance(schema, invoiceId) {
  const row = await db.one(
    `SELECT i.total_amount
        - COALESCE((SELECT SUM(r.amount) FROM ${schema}.receipts r
                    WHERE r.ar_invoice_id = $1 AND r.deactivated_at IS NULL), 0)
      AS remaining
     FROM ${schema}.ar_invoices i WHERE i.id = $1`,
    [invoiceId],
  );
  return parseFloat(row.remaining) || 0;
}

class ReceiptsController extends BaseController {
  constructor() {
    super('receipts', 'receipt');
  }

  async create(req, res) {
    if (req.body.method && !VALID_METHODS.includes(req.body.method)) {
      return res.status(400).json({
        error: `Invalid receipt method: ${req.body.method}. Must be one of: ${VALID_METHODS.join(', ')}`,
      });
    }

    const invoiceId = req.body.ar_invoice_id;
    const receiptAmount = parseFloat(req.body.amount) || 0;

    if (invoiceId && receiptAmount > 0) {
      try {
        const schema = this.getSchema(req);
        const invoice = await db('arInvoices', schema).findById(invoiceId);
        if (!invoice) {
          return res.status(400).json({ error: 'Referenced AR invoice not found' });
        }
        if (invoice.status === 'voided') {
          return res.status(400).json({ error: 'Cannot receive payment on a voided invoice' });
        }
        if (invoice.status === 'open') {
          return res.status(400).json({ error: 'Invoice must be sent before receiving payment' });
        }
        const currentBalance = await computeRemainingBalance(schema, invoiceId);
        if (receiptAmount > currentBalance) {
          return res.status(400).json({
            error: `Receipt amount ${receiptAmount} exceeds remaining balance ${currentBalance}`,
          });
        }
      } catch (err) {
        return this.handleError(err, res, 'validating invoice for', this.errorLabel);
      }
    }

    const result = await super.create(req, res);

    if (invoiceId && receiptAmount > 0 && res.statusCode === 201) {
      try {
        const schema = this.getSchema(req);
        const invoice = await db('arInvoices', schema).findById(invoiceId);

        const remaining = await computeRemainingBalance(schema, invoiceId);
        if (remaining <= 0) {
          await db.none(
            `UPDATE ${schema}.ar_invoices SET status = 'paid' WHERE id = $1`,
            [invoiceId],
          );
          logger.info(`AR Invoice ${invoiceId} fully paid`);
        }

        try {
          await postARReceipt(schema, {
            ...req.body, id: res.body?.id,
            tenant_id: invoice.tenant_id,
            receipt_date: req.body.receipt_date || new Date().toISOString().split('T')[0],
          }, {
            cashAccountId: req.body.cash_account_id,
            arReceivableAccountId: req.body.ar_receivable_account_id,
            companyId: invoice.company_id,
          });
        } catch (glErr) {
          logger.error(`GL posting failed for AR Receipt on Invoice ${invoiceId}: ${glErr.message}`);
        }
      } catch (err) {
        logger.error(`Failed to check invoice balance after receipt: ${err.message}`);
      }
    }

    return result;
  }

  async update(req, res) {
    if (req.body.method && !VALID_METHODS.includes(req.body.method)) {
      return res.status(400).json({
        error: `Invalid receipt method: ${req.body.method}. Must be one of: ${VALID_METHODS.join(', ')}`,
      });
    }
    return super.update(req, res);
  }
}

const instance = new ReceiptsController();
export default instance;
export { ReceiptsController, VALID_METHODS, computeRemainingBalance };
