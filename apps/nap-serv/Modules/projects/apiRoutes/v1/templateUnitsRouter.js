/**
 * @file TemplateUnits router — /api/projects/v1/template-units
 * @module projects/apiRoutes/v1/templateUnitsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import templateUnitsController from '../../controllers/templateUnitsController.js';

export default createRouter(templateUnitsController);
