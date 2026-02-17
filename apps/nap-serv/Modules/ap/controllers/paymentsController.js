/**
 * @file Payments controller — CRUD with method validation, balance tracking, and GL hooks
 * @module ap/controllers/paymentsController
 *
 * Records payments against AP invoices. Supports partial payments.
 * On payment: updates invoice balance_due and status, creates GL entry (debit AP Liability, credit Cash/Bank).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';
import db from '../../../src/db/db.js';
import { postAPPayment } from '../../accounting/services/postingService.js';
import logger from '../../../src/utils/logger.js';

const VALID_METHODS = ['check', 'ach', 'wire'];

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

    // If linked to an invoice, update the invoice's balance_due
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

        const currentBalance = parseFloat(invoice.balance_due) || 0;
        if (paymentAmount > currentBalance) {
          return res.status(400).json({
            error: `Payment amount ${paymentAmount} exceeds remaining balance ${currentBalance}`,
          });
        }
      } catch (err) {
        return this.handleError(err, res, 'validating invoice for', this.errorLabel);
      }
    }

    // Create the payment record
    const result = await super.create(req, res);

    // After successful creation, update invoice balance
    if (invoiceId && paymentAmount > 0 && res.statusCode === 201) {
      try {
        const schema = this.getSchema(req);
        const invoice = await db('apInvoices', schema).findById(invoiceId);
        const newBalance = parseFloat(invoice.balance_due) - paymentAmount;

        await db.none(
          `UPDATE ${schema}.ap_invoices SET balance_due = $1 WHERE id = $2`,
          [newBalance, invoiceId],
        );

        // If fully paid, update status
        if (newBalance <= 0) {
          await db.none(
            `UPDATE ${schema}.ap_invoices SET status = 'paid', balance_due = 0 WHERE id = $1`,
            [invoiceId],
          );
          logger.info(`AP Invoice ${invoiceId} fully paid`);
        }

        // GL entry: debit AP Liability, credit Cash/Bank
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
        logger.error(`Failed to update invoice balance after payment: ${err.message}`);
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
export { PaymentsController, VALID_METHODS };
