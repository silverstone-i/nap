/**
 * @file Addresses controller — standard CRUD for addresses linked via sources
 * @module core/controllers/addressesController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class AddressesController extends BaseController {
  constructor() {
    super('addresses');
  }

  async create(req, res) {
    if (!req.body.tenant_id && req.user?.tenant_id) {
      req.body.tenant_id = req.user.tenant_id;
    }
    return super.create(req, res);
  }
}

const instance = new AddressesController();
export default instance;
export { AddressesController };
