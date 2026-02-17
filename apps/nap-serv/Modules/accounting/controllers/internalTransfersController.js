/**
 * @file Internal Transfers controller — standard CRUD
 * @module accounting/controllers/internalTransfersController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class InternalTransfersController extends BaseController {
  constructor() {
    super('internalTransfers', 'internal-transfer');
  }

  async create(req, res) {
    if (!req.body.from_account_id) {
      return res.status(400).json({ error: 'from_account_id is required' });
    }
    if (!req.body.to_account_id) {
      return res.status(400).json({ error: 'to_account_id is required' });
    }
    if (req.body.from_account_id === req.body.to_account_id) {
      return res.status(400).json({ error: 'from_account_id and to_account_id must be different' });
    }
    return super.create(req, res);
  }
}

const instance = new InternalTransfersController();
export default instance;
export { InternalTransfersController };
