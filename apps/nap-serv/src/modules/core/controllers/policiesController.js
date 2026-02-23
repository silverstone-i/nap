/**
 * @file Policies controller — standard CRUD for role permission grants
 * @module core/controllers/policiesController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class PoliciesController extends BaseController {
  constructor() {
    super('policies');
  }
}

const instance = new PoliciesController();
export default instance;
export { PoliciesController };
