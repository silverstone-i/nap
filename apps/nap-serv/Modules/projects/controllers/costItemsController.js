/**
 * @file CostItems controller — CRUD with cost_class and cost_source enum validation
 * @module projects/controllers/costItemsController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

const VALID_COST_CLASSES = ['labor', 'material', 'subcontract', 'equipment', 'other'];
const VALID_COST_SOURCES = ['budget', 'change_order'];

function validateEnums(body) {
  if (body.cost_class && !VALID_COST_CLASSES.includes(body.cost_class)) {
    return `Invalid cost_class: ${body.cost_class}. Must be one of: ${VALID_COST_CLASSES.join(', ')}`;
  }
  if (body.cost_source && !VALID_COST_SOURCES.includes(body.cost_source)) {
    return `Invalid cost_source: ${body.cost_source}. Must be one of: ${VALID_COST_SOURCES.join(', ')}`;
  }
  return null;
}

class CostItemsController extends BaseController {
  constructor() {
    super('costItems', 'cost-item');
  }

  async create(req, res) {
    const err = validateEnums(req.body);
    if (err) return res.status(400).json({ error: err });
    return super.create(req, res);
  }

  async update(req, res) {
    const err = validateEnums(req.body);
    if (err) return res.status(400).json({ error: err });
    return super.update(req, res);
  }
}

const instance = new CostItemsController();
export default instance;
export { CostItemsController, VALID_COST_CLASSES, VALID_COST_SOURCES };
