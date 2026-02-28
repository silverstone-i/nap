/**
 * @file Template tasks controller — standard CRUD for template task entries
 * @module projects/controllers/templateTasksController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class TemplateTasksController extends BaseController {
  constructor() {
    super('templateTasks');
  }
}

const instance = new TemplateTasksController();
export default instance;
export { TemplateTasksController };
