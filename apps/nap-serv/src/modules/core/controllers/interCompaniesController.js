/**
 * @file InterCompanies controller — standard CRUD
 * @module core/controllers/interCompaniesController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class InterCompaniesController extends BaseController {
  constructor() {
    super('interCompanies', 'inter-company');
  }
}

const instance = new InterCompaniesController();
export default instance;
export { InterCompaniesController };
