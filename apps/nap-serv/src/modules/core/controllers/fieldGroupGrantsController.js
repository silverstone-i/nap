/**
 * @file Field group grants controller — CRUD for RBAC Layer 4 role-group assignments
 * @module core/controllers/fieldGroupGrantsController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class FieldGroupGrantsController extends BaseController {
  constructor() {
    super('fieldGroupGrants');
  }
}

const instance = new FieldGroupGrantsController();
export default instance;
export { FieldGroupGrantsController };
