/**
 * @file VendorPricing controller — standard CRUD
 * @module bom/controllers/vendorPricingController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class VendorPricingController extends BaseController {
  constructor() {
    super('vendorPricing', 'vendor-pricing');
  }
}

const instance = new VendorPricingController();
export default instance;
export { VendorPricingController };
