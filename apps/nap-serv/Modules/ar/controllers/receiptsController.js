/**
 * @file Receipts controller — CRUD with method validation, balance tracking, and GL hooks
 * @module ar/controllers/receiptsController
 *
 * Records receipts against AR invoices. Supports partial payments.
 * On receipt: updates invoice balance_due and status, creates GL entry (debit Cash/Bank, credit AR).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';
import db from '../../../src/db/db.js';
import { postARReceipt } from '../../accounting/services/postingService.js';
import logger from '../../../src/utils/logger.js';

const VALID_METHODS = ['check', 'ach', 'wire'];

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

    // If linked to an invoice, validate and track balance
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

        const currentBalance = parseFloat(invoice.balance_due) || 0;
        if (receiptAmount > currentBalance) {
          return res.status(400).json({
            error: `Receipt amount ${receiptAmount} exceeds remaining balance ${currentBalance}`,
          });
        }
      } catch (err) {
        return this.handleError(err, res, 'validating invoice for', this.errorLabel);
      }
    }

    // Create the receipt record
    const result = await super.create(req, res);

    // After successful creation, update invoice balance
    if (invoiceId && receiptAmount > 0 && res.statusCode === 201) {
      try {
        const schema = this.getSchema(req);
        const invoice = await db('arInvoices', schema).findById(invoiceId);
        const newBalance = parseFloat(invoice.balance_due) - receiptAmount;

        await db.none(
          `UPDATE ${schema}.ar_invoices SET balance_due = $1 WHERE id = $2`,
          [newBalance, invoiceId],
        );

        // If fully paid, update status
        if (newBalance <= 0) {
          await db.none(
            `UPDATE ${schema}.ar_invoices SET status = 'paid', balance_due = 0 WHERE id = $1`,
            [invoiceId],
          );
          logger.info(`AR Invoice ${invoiceId} fully paid`);
        }

        // GL entry: debit Cash/Bank, credit AR
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
        logger.error(`Failed to update invoice balance after receipt: ${err.message}`);
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
export { ReceiptsController, VALID_METHODS };
