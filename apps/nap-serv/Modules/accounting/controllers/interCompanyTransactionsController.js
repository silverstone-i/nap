/**
 * @file Inter-Company Transactions controller — CRUD with module validation
 * @module accounting/controllers/interCompanyTransactionsController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

const VALID_MODULES = ['ar', 'ap', 'je'];

class InterCompanyTransactionsController extends BaseController {
  constructor() {
    super('interCompanyTransactions', 'inter-company-transaction');
  }

  async create(req, res) {
    if (req.body.module && !VALID_MODULES.includes(req.body.module)) {
      return res.status(400).json({
        error: `Invalid module: ${req.body.module}. Must be one of: ${VALID_MODULES.join(', ')}`,
      });
    }
    return super.create(req, res);
  }
}

const instance = new InterCompanyTransactionsController();
export default instance;
export { InterCompanyTransactionsController, VALID_MODULES };
