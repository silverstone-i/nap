/**
 * @file Template tasks controller — standard CRUD for template task entries
 * @module projects/controllers/templateTasksController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class TemplateTasksController extends BaseController {
  constructor() {
    super('templateTasks');
    this.rbacConfig = { module: 'projects', router: 'template-tasks' };
  }
}

const instance = new TemplateTasksController();
export default instance;
export { TemplateTasksController };
