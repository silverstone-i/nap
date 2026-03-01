/**
 * @file DeliverableAssignments router — /api/activities/v1/deliverable-assignments
 * @module activities/apiRoutes/v1/deliverableAssignmentsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import deliverableAssignmentsController from '../../controllers/deliverableAssignmentsController.js';

const meta = withMeta({ module: 'activities', router: 'deliverable-assignments' });

export default createRouter(deliverableAssignmentsController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
