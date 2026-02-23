/**
 * @file Projects router — /api/projects/v1/projects
 * @module projects/apiRoutes/v1/projectsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import projectsController from '../../controllers/projectsController.js';
import { withMeta } from '../../../../src/middleware/withMeta.js';

const meta = withMeta({ module: 'projects', router: 'projects' });

export default createRouter(projectsController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
