/**
 * @file Template cost items controller — standard CRUD for template cost items
 * @module projects/controllers/templateCostItemsController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class TemplateCostItemsController extends BaseController {
  constructor() {
    super('templateCostItems');
  }
}

const instance = new TemplateCostItemsController();
export default instance;
export { TemplateCostItemsController };
