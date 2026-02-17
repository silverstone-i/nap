/**
 * @file TaskGroups controller — standard CRUD for task group code library
 * @module projects/controllers/taskGroupsController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class TaskGroupsController extends BaseController {
  constructor() {
    super('taskGroups', 'task-group');
  }
}

const instance = new TaskGroupsController();
export default instance;
export { TaskGroupsController };
