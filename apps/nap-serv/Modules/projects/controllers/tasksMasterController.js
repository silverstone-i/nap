/**
 * @file TasksMaster controller — standard CRUD for master task library
 * @module projects/controllers/tasksMasterController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class TasksMasterController extends BaseController {
  constructor() {
    super('tasksMaster', 'master-task');
  }
}

const instance = new TasksMasterController();
export default instance;
export { TasksMasterController };
