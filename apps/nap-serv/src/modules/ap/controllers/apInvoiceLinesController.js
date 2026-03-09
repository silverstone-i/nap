/**
 * @file AP Invoice Lines controller — CRUD with account_id validation
 * @module ap/controllers/apInvoiceLinesController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class ApInvoiceLinesController extends BaseController {
  constructor() {
    super('apInvoiceLines', 'ap-invoice-line');
    this.rbacConfig = { module: 'ap', router: 'ap-invoice-lines' };
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
