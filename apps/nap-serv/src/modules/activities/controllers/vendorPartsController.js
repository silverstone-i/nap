/**
 * @file VendorParts controller — standard CRUD
 * @module activities/controllers/vendorPartsController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class VendorPartsController extends BaseController {
  constructor() {
    super('vendorParts', 'vendor-part');
  }
}

const instance = new VendorPartsController();
export default instance;
export { VendorPartsController };
