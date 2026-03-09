/**
 * @file Inter-Company Accounts controller — standard CRUD
 * @module accounting/controllers/interCompanyAccountsController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class InterCompanyAccountsController extends BaseController {
  constructor() {
    super('interCompanyAccounts', 'inter-company-account');
    this.rbacConfig = { module: 'accounting', router: 'inter-company-accounts' };
  }
}

const instance = new InterCompanyAccountsController();
export default instance;
export { InterCompanyAccountsController };
