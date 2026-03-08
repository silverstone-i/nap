/**
 * @file Deliverables router — /api/activities/v1/deliverables
 * @module activities/apiRoutes/v1/deliverablesRouter
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import deliverablesController from '../../controllers/deliverablesController.js';

const meta = withMeta({ module: 'activities', router: 'deliverables' });

export default createRouter(deliverablesController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
