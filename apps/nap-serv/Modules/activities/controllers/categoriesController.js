/**
 * @file Categories controller — CRUD with type enum validation
 * @module activities/controllers/categoriesController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

const VALID_CATEGORY_TYPES = ['labor', 'material', 'subcontract', 'equipment', 'other'];

class CategoriesController extends BaseController {
  constructor() {
    super('categories', 'category');
  }

  async create(req, res) {
    if (req.body.type && !VALID_CATEGORY_TYPES.includes(req.body.type)) {
      return res.status(400).json({
        error: `Invalid category type: ${req.body.type}. Must be one of: ${VALID_CATEGORY_TYPES.join(', ')}`,
      });
    }
    return super.create(req, res);
  }

  async update(req, res) {
    if (req.body.type && !VALID_CATEGORY_TYPES.includes(req.body.type)) {
      return res.status(400).json({
        error: `Invalid category type: ${req.body.type}. Must be one of: ${VALID_CATEGORY_TYPES.join(', ')}`,
      });
    }
    return super.update(req, res);
  }
}

const instance = new CategoriesController();
export default instance;
export { CategoriesController, VALID_CATEGORY_TYPES };
