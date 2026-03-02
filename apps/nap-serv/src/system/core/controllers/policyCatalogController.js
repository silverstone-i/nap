/**
 * @file PolicyCatalog controller — read-only catalog of valid permission tuples
 * @module core/controllers/policyCatalogController
 *
 * Seed-only reference data — no mutations exposed.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class PolicyCatalogController extends BaseController {
  constructor() {
    super('policyCatalog');
  }
}

const instance = new PolicyCatalogController();
export default instance;
export { PolicyCatalogController };
