/**
 * @file State filters controller — CRUD for RBAC Layer 3 state filters
 * @module core/controllers/stateFiltersController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class StateFiltersController extends BaseController {
  constructor() {
    super('stateFilters');
  }
}

const instance = new StateFiltersController();
export default instance;
export { StateFiltersController };
