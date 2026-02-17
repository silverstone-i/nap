/**
 * @file Inter-Company Accounts controller — standard CRUD
 * @module accounting/controllers/interCompanyAccountsController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class InterCompanyAccountsController extends BaseController {
  constructor() {
    super('interCompanyAccounts', 'inter-company-account');
  }
}

const instance = new InterCompanyAccountsController();
export default instance;
export { InterCompanyAccountsController };
