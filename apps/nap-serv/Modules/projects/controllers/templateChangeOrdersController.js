/**
 * @file TemplateChangeOrders controller — standard CRUD for template change orders
 * @module projects/controllers/templateChangeOrdersController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class TemplateChangeOrdersController extends BaseController {
  constructor() {
    super('templateChangeOrders', 'template-change-order');
  }
}

const instance = new TemplateChangeOrdersController();
export default instance;
export { TemplateChangeOrdersController };
