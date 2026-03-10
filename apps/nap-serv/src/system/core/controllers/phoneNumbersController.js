/**
 * @file Phone numbers controller — standard CRUD
 * @module core/controllers/phoneNumbersController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class PhoneNumbersController extends BaseController {
  constructor() {
    super('phoneNumbers');
  }

  async create(req, res) {
    if (!req.body.tenant_id && req.user?.tenant_id) {
      req.body.tenant_id = req.user.tenant_id;
    }
    return super.create(req, res);
  }
}

const instance = new PhoneNumbersController();
export default instance;
export { PhoneNumbersController };
