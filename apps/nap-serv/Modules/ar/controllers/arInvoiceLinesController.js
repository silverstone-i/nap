/**
 * @file AR Invoice Lines controller — CRUD with account_id validation
 * @module ar/controllers/arInvoiceLinesController
 *
 * Validates that account_id references a valid GL account for revenue recognition.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class ArInvoiceLinesController extends BaseController {
  constructor() {
    super('arInvoiceLines', 'ar-invoice-line');
  }

  async create(req, res) {
    if (!req.body.account_id) {
      return res.status(400).json({ error: 'account_id is required for invoice lines' });
    }
    return super.create(req, res);
  }

  async update(req, res) {
    if (req.body.account_id === null) {
      return res.status(400).json({ error: 'account_id cannot be null' });
    }
    return super.update(req, res);
  }
}

const instance = new ArInvoiceLinesController();
export default instance;
export { ArInvoiceLinesController };
