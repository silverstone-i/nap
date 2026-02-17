/**
 * @file Units router — /api/projects/v1/units
 * @module projects/apiRoutes/v1/unitsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import unitsController from '../../controllers/unitsController.js';

export default createRouter(unitsController);
