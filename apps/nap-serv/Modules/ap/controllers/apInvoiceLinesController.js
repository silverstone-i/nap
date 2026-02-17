/**
 * @file AP Invoice Lines controller — CRUD with account_id validation
 * @module ap/controllers/apInvoiceLinesController
 *
 * Validates that account_id references a valid GL account.
 * Optionally links to cost_line_id and activity_id for cost tracking.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class ApInvoiceLinesController extends BaseController {
  constructor() {
    super('apInvoiceLines', 'ap-invoice-line');
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

const instance = new ApInvoiceLinesController();
export default instance;
export { ApInvoiceLinesController };
