/**
 * @file Activities router — /api/activities/v1/activities
 * @module activities/apiRoutes/v1/activitiesRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import activitiesController from '../../controllers/activitiesController.js';

export default createRouter(activitiesController);
