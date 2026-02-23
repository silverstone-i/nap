/**
 * @file Activities module route aggregator — mounts activity sub-routers under /api/activities
 * @module activities/apiRoutes/v1/activitiesApiRoutes
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import categoriesRouter from './categoriesRouter.js';
import activitiesRouter from './activitiesRouter.js';
import deliverablesRouter from './deliverablesRouter.js';
import deliverableAssignmentsRouter from './deliverableAssignmentsRouter.js';
import budgetsRouter from './budgetsRouter.js';
import costLinesRouter from './costLinesRouter.js';
import actualCostsRouter from './actualCostsRouter.js';
import vendorPartsRouter from './vendorPartsRouter.js';

const router = Router();

router.use('/v1/categories', categoriesRouter);
router.use('/v1/activities', activitiesRouter);
router.use('/v1/deliverables', deliverablesRouter);
router.use('/v1/deliverable-assignments', deliverableAssignmentsRouter);
router.use('/v1/budgets', budgetsRouter);
router.use('/v1/cost-lines', costLinesRouter);
router.use('/v1/actual-costs', actualCostsRouter);
router.use('/v1/vendor-parts', vendorPartsRouter);

export default router;
