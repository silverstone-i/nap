/**
 * @file Template change orders controller — standard CRUD
 * @module projects/controllers/templateChangeOrdersController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class TemplateChangeOrdersController extends BaseController {
  constructor() {
    super('templateChangeOrders');
  }
}

const instance = new TemplateChangeOrdersController();
export default instance;
export { TemplateChangeOrdersController };
