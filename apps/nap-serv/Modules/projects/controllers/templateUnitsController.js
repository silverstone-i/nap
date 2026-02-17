/**
 * @file TemplateUnits controller — standard CRUD for unit templates
 * @module projects/controllers/templateUnitsController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class TemplateUnitsController extends BaseController {
  constructor() {
    super('templateUnits', 'template-unit');
  }
}

const instance = new TemplateUnitsController();
export default instance;
export { TemplateUnitsController };
