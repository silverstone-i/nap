/**
 * @file Projects router — /api/projects/v1/projects
 * @module projects/apiRoutes/v1/projectsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import projectsController from '../../controllers/projectsController.js';

export default createRouter(projectsController);
