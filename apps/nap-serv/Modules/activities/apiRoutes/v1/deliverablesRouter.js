/**
 * @file Deliverables router — /api/activities/v1/deliverables
 * @module activities/apiRoutes/v1/deliverablesRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import deliverablesController from '../../controllers/deliverablesController.js';

export default createRouter(deliverablesController);
