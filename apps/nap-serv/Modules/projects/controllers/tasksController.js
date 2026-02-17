/**
 * @file Tasks controller — standard CRUD for unit-level task instances
 * @module projects/controllers/tasksController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class TasksController extends BaseController {
  constructor() {
    super('tasks', 'task');
  }
}

const instance = new TasksController();
export default instance;
export { TasksController };
