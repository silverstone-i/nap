/**
 * @file Chart of Accounts controller — CRUD with type validation
 * @module accounting/controllers/chartOfAccountsController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

const VALID_TYPES = ['asset', 'liability', 'equity', 'income', 'expense', 'cash', 'bank'];

class ChartOfAccountsController extends BaseController {
  constructor() {
    super('chartOfAccounts', 'chart-of-accounts');
  }

  async create(req, res) {
    if (req.body.type && !VALID_TYPES.includes(req.body.type)) {
      return res.status(400).json({
        error: `Invalid account type: ${req.body.type}. Must be one of: ${VALID_TYPES.join(', ')}`,
      });
    }
    return super.create(req, res);
  }

  async update(req, res) {
    if (req.body.type && !VALID_TYPES.includes(req.body.type)) {
      return res.status(400).json({
        error: `Invalid account type: ${req.body.type}. Must be one of: ${VALID_TYPES.join(', ')}`,
      });
    }
    return super.update(req, res);
  }
}

const instance = new ChartOfAccountsController();
export default instance;
export { ChartOfAccountsController, VALID_TYPES };
