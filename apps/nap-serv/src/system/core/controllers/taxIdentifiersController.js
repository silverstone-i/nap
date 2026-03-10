/**
 * @file Tax identifiers controller — CRUD for typed tax IDs linked via sources
 * @module core/controllers/taxIdentifiersController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class TaxIdentifiersController extends BaseController {
  constructor() {
    super('taxIdentifiers');
    this.rbacConfig = { module: 'core', router: 'tax-identifiers' };
  }
}

const instance = new TaxIdentifiersController();
export default instance;
export { TaxIdentifiersController };
