/**
 * @file Tasks controller — standard CRUD for unit tasks
 * @module projects/controllers/tasksController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class TasksController extends BaseController {
  constructor() {
    super('tasks');
  }
}

const instance = new TasksController();
export default instance;
export { TasksController };
