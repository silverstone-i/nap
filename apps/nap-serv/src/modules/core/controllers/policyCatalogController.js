/**
 * @file Policy Catalog controller — read-only access to the policy catalog
 * @module core/controllers/policyCatalogController
 *
 * The policy_catalog table is seed-only reference data. This controller
 * exposes read endpoints (GET /, GET /where, GET /:id) so the client
 * can discover valid module/router/action combinations for role configuration.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import ViewController from '../../../lib/ViewController.js';

class PolicyCatalogController extends ViewController {
  constructor() {
    super('policyCatalog');
  }
}

const instance = new PolicyCatalogController();
export default instance;
export { PolicyCatalogController };
