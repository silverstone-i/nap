/**
 * @file Inter-companies controller — standard CRUD for inter-company entities
 * @module core/controllers/interCompaniesController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class InterCompaniesController extends BaseController {
  constructor() {
    super('interCompanies');
  }

  /**
   * POST / — inject tenant_id from auth session before creating.
   */
  async create(req, res) {
    if (!req.body.tenant_id && req.user?.tenant_id) {
      req.body.tenant_id = req.user.tenant_id;
    }
    return super.create(req, res);
  }
}

const instance = new InterCompaniesController();
export default instance;
export { InterCompaniesController };
