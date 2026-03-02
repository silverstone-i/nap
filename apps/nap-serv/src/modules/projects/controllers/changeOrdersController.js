/**
 * @file Change orders controller — standard CRUD for unit change orders
 * @module projects/controllers/changeOrdersController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class ChangeOrdersController extends BaseController {
  constructor() {
    super('changeOrders');
  }
}

const instance = new ChangeOrdersController();
export default instance;
export { ChangeOrdersController };
