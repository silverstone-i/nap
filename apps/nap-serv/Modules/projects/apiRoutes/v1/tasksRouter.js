/**
 * @file Tasks router — /api/projects/v1/tasks
 * @module projects/apiRoutes/v1/tasksRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import tasksController from '../../controllers/tasksController.js';

export default createRouter(tasksController);
