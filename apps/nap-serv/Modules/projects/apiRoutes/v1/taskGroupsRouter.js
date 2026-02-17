/**
 * @file TaskGroups router — /api/projects/v1/task-groups
 * @module projects/apiRoutes/v1/taskGroupsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import taskGroupsController from '../../controllers/taskGroupsController.js';

export default createRouter(taskGroupsController);
