/**
 * @file Budgets router — /api/activities/v1/budgets
 * @module activities/apiRoutes/v1/budgetsRouter
 *
 * Includes custom POST /new-version route for budget versioning.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import budgetsController from '../../controllers/budgetsController.js';

const router = createRouter(budgetsController);

// Custom route for creating a new budget version
router.post('/new-version', (req, res) => budgetsController.createNewVersion(req, res));

export default router;
