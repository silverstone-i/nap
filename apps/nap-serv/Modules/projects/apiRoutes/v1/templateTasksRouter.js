/**
 * @file TemplateTasks router — /api/projects/v1/template-tasks
 * @module projects/apiRoutes/v1/templateTasksRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import templateTasksController from '../../controllers/templateTasksController.js';

export default createRouter(templateTasksController);
