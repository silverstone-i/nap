/**
 * @file Category-Account Map controller — CRUD with date-range validation
 * @module accounting/controllers/categoryAccountMapController
 *
 * Validates that valid_from < valid_to when both are provided.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class CategoryAccountMapController extends BaseController {
  constructor() {
    super('categoryAccountMap', 'category-account-map');
  }

  async create(req, res) {
    if (req.body.valid_from && req.body.valid_to) {
      if (new Date(req.body.valid_to) <= new Date(req.body.valid_from)) {
        return res.status(400).json({ error: 'valid_to must be after valid_from' });
      }
    }
    if (!req.body.category_id) {
      return res.status(400).json({ error: 'category_id is required' });
    }
    if (!req.body.account_id) {
      return res.status(400).json({ error: 'account_id is required' });
    }
    return super.create(req, res);
  }

  async update(req, res) {
    if (req.body.valid_from && req.body.valid_to) {
      if (new Date(req.body.valid_to) <= new Date(req.body.valid_from)) {
        return res.status(400).json({ error: 'valid_to must be after valid_from' });
      }
    }
    return super.update(req, res);
  }
}

const instance = new CategoryAccountMapController();
export default instance;
export { CategoryAccountMapController };
