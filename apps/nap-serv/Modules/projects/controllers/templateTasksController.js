/**
 * @file TemplateTasks controller — standard CRUD for template tasks
 * @module projects/controllers/templateTasksController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class TemplateTasksController extends BaseController {
  constructor() {
    super('templateTasks', 'template-task');
  }
}

const instance = new TemplateTasksController();
export default instance;
export { TemplateTasksController };
