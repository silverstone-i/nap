/**
 * @file Units controller — standard CRUD for project units
 * @module projects/controllers/unitsController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class UnitsController extends BaseController {
  constructor() {
    super('units');
  }
}

const instance = new UnitsController();
export default instance;
export { UnitsController };
