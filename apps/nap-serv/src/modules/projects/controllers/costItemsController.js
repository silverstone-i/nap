/**
 * @file Cost items controller — standard CRUD for task cost items
 * @module projects/controllers/costItemsController
 *
 * The `amount` column is a GENERATED ALWAYS column (quantity * unit_cost)
 * and is computed by PostgreSQL — it should never be set directly.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class CostItemsController extends BaseController {
  constructor() {
    super('costItems');
  }
}

const instance = new CostItemsController();
export default instance;
export { CostItemsController };
