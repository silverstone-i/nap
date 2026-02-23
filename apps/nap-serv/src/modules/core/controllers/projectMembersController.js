/**
 * @file Project members controller — CRUD for RBAC Layer 2 project scope assignments
 * @module core/controllers/projectMembersController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class ProjectMembersController extends BaseController {
  constructor() {
    super('projectMembers');
  }
}

const instance = new ProjectMembersController();
export default instance;
export { ProjectMembersController };
