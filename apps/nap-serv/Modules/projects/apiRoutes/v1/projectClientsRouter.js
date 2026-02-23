/**
 * @file Project clients router — /api/projects/v1/project-clients
 * @module projects/apiRoutes/v1/projectClientsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import projectClientsController from '../../controllers/projectClientsController.js';
import { withMeta } from '../../../../src/middleware/withMeta.js';

const meta = withMeta({ module: 'projects', router: 'project-clients' });

export default createRouter(projectClientsController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
