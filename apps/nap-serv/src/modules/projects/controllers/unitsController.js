/**
 * @file Units controller — standard CRUD for project units
 * @module projects/controllers/unitsController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class UnitsController extends BaseController {
  constructor() {
    super('units');
    this.rbacConfig = { module: 'projects', router: 'units', scopeColumn: 'project_id' };
  }
}

const instance = new UnitsController();
export default instance;
export { UnitsController };
