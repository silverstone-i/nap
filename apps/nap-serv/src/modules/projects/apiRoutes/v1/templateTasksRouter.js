/**
 * @file Template tasks router — /api/projects/v1/template-tasks
 * @module projects/apiRoutes/v1/templateTasksRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import templateTasksController from '../../controllers/templateTasksController.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'projects', router: 'template-tasks' });

export default createRouter(templateTasksController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
