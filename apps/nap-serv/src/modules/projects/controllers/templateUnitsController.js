/**
 * @file Template units controller — CRUD for unit templates
 * @module projects/controllers/templateUnitsController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class TemplateUnitsController extends BaseController {
  constructor() {
    super('templateUnits');
    this.rbacConfig = { module: 'projects', router: 'template-units' };
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

const instance = new TemplateUnitsController();
export default instance;
export { TemplateUnitsController };
