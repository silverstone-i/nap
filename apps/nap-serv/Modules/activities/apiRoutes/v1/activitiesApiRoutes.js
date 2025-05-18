'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import express from 'express';
import activitiesApi from './activitiesApi.js';
import actualCostsApi from './actualCostsApi.js';
import categoriesApi from './categoriesApi.js';
import changeOrderLinesApi from './changeOrderLinesApi.js';
import costLinesApi from './costLinesApi.js';
import projectsApi from './projectsApi.js';
import subProjectAssignmentsApi from './subProjectAssignmentsApi.js';
import budgetsApi from './budgetsApi.js';
import subProjectsApi from './subProjectsApi.js';
import vendorPartsApi from './vendorPartsApi.js';

const router = express.Router();
router.use('/v1/activities', activitiesApi);
router.use('/v1/actual-costs', actualCostsApi);
router.use('/v1/categories', categoriesApi);
router.use('/v1/change-order-lines', changeOrderLinesApi);
router.use('/v1/cost-lines', costLinesApi);
router.use('/v1/projects', projectsApi);
router.use('/v1/sub-project-assignments', subProjectAssignmentsApi);
router.use('/v1/budgets', budgetsApi);
router.use('/v1/sub-projects', subProjectsApi);
router.use('/v1/vendor-parts', vendorPartsApi);

console.log('Loaded activities router');

export default router;
