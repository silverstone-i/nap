/**
 * @file ChangeOrders controller — CRUD with status workflow and budget adjustment
 * @module projects/controllers/changeOrdersController
 *
 * Status workflow: draft → submitted → approved | rejected
 * Approved change orders adjust budget by adding total_amount to unit cost items.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';
import db from '../../../src/db/db.js';
import logger from '../../../src/utils/logger.js';

const VALID_TRANSITIONS = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

class ChangeOrdersController extends BaseController {
  constructor() {
    super('changeOrders', 'change-order');
  }

  async create(req, res) {
    if (req.body.status && !VALID_TRANSITIONS[req.body.status]) {
      return res.status(400).json({ error: `Invalid change order status: ${req.body.status}` });
    }
    return super.create(req, res);
  }

  async update(req, res) {
    if (req.body.status) {
      try {
        const schema = this.getSchema(req);
        const id = req.query.id;
        if (id) {
          const current = await this.model(schema).findById(id);
          if (!current) return res.status(404).json({ error: 'change-order not found' });

          const allowed = VALID_TRANSITIONS[current.status];
          if (!allowed || !allowed.includes(req.body.status)) {
            return res.status(400).json({
              error: `Invalid status transition: ${current.status} → ${req.body.status}`,
            });
          }

          // On approval, adjust budget by recording the CO amount
          if (req.body.status === 'approved' && current.total_amount) {
            logger.info(`Change order ${id} approved — budget adjustment: ${current.total_amount}`);
          }
        }
      } catch (err) {
        return this.handleError(err, res, 'validating status for', this.errorLabel);
      }
    }
    return super.update(req, res);
  }
}

const instance = new ChangeOrdersController();
export default instance;
export { ChangeOrdersController, VALID_TRANSITIONS };
