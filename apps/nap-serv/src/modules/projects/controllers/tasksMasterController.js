/**
 * @file Tasks master controller — CRUD for master task definitions
 * @module projects/controllers/tasksMasterController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class TasksMasterController extends BaseController {
  constructor() {
    super('tasksMaster');
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

const instance = new TasksMasterController();
export default instance;
export { TasksMasterController };
