/**
 * @file Template cost items controller — standard CRUD for template cost items
 * @module projects/controllers/templateCostItemsController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class TemplateCostItemsController extends BaseController {
  constructor() {
    super('templateCostItems');
    this.rbacConfig = { module: 'projects', router: 'template-cost-items' };
  }
}

const instance = new TemplateCostItemsController();
export default instance;
export { TemplateCostItemsController };
