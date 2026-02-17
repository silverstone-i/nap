/**
 * @file TasksMaster router — /api/projects/v1/tasks-master
 * @module projects/apiRoutes/v1/tasksMasterRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import tasksMasterController from '../../controllers/tasksMasterController.js';

export default createRouter(tasksMasterController);
