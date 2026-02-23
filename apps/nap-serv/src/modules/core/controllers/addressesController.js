/**
 * @file Addresses controller — standard CRUD for addresses linked via sources
 * @module core/controllers/addressesController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class AddressesController extends BaseController {
  constructor() {
    super('addresses');
  }
}

const instance = new AddressesController();
export default instance;
export { AddressesController };
