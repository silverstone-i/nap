/**
 * @file Task groups router — /api/projects/v1/task-groups
 * @module projects/apiRoutes/v1/taskGroupsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import taskGroupsController from '../../controllers/taskGroupsController.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'projects', router: 'task-groups' });

export default createRouter(taskGroupsController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
