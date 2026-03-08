/**
 * @file Company members controller — CRUD for RBAC Layer 2 company scope assignments
 * @module core/controllers/companyMembersController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class CompanyMembersController extends BaseController {
  constructor() {
    super('companyMembers');
  }
}

const instance = new CompanyMembersController();
export default instance;
export { CompanyMembersController };
