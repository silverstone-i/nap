/**
 * @file Numbering config controller — CRUD for tenant numbering configuration
 * @module core/controllers/numberingConfigController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class NumberingConfigController extends BaseController {
  constructor() {
    super('tenantNumberingConfig');
    this.rbacConfig = {
      module: 'core',
      router: 'numbering-config',
    };
  }
}

const instance = new NumberingConfigController();
export default instance;
export { NumberingConfigController };
