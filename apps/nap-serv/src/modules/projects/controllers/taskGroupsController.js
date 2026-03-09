/**
 * @file Task groups controller — CRUD for tenant-level task categories
 * @module projects/controllers/taskGroupsController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class TaskGroupsController extends BaseController {
  constructor() {
    super('taskGroups');
    this.rbacConfig = { module: 'projects', router: 'task-groups' };
  }

  /**
   * POST / — inject tenant_id from auth session before creating.
   */
  async create(req, res) {
    if (!req.body.tenant_id && req.user?.tenant_id) {
      req.body.tenant_id = req.user.tenant_id;
    }
    return super.create(req, res);
  }
}

const instance = new TaskGroupsController();
export default instance;
export { TaskGroupsController };
