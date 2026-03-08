/**
 * @file Activities router — /api/activities/v1/activities
 * @module activities/apiRoutes/v1/activitiesRouter
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import activitiesController from '../../controllers/activitiesController.js';

const meta = withMeta({ module: 'activities', router: 'activities' });

export default createRouter(activitiesController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
