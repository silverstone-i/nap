/**
 * @file Inter-Companies router — /api/core/v1/inter-companies
 * @module core/apiRoutes/v1/interCompaniesRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import interCompaniesController from '../../controllers/interCompaniesController.js';

export default createRouter(interCompaniesController);
