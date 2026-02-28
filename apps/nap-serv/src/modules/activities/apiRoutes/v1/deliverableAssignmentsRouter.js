/**
 * @file DeliverableAssignments router — /api/activities/v1/deliverable-assignments
 * @module activities/apiRoutes/v1/deliverableAssignmentsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import deliverableAssignmentsController from '../../controllers/deliverableAssignmentsController.js';

export default createRouter(deliverableAssignmentsController);
