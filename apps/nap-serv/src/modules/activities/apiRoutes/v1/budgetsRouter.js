/**
 * @file Budgets router — /api/activities/v1/budgets
 * @module activities/apiRoutes/v1/budgetsRouter
 *
 * Includes custom POST /new-version route for budget versioning.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { moduleEntitlement } from '../../../../middleware/moduleEntitlement.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import budgetsController from '../../controllers/budgetsController.js';

const meta = withMeta({ module: 'activities', router: 'budgets' });

const router = createRouter(budgetsController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});

// Custom route for creating a new budget version
router.post('/new-version', meta, moduleEntitlement, (req, res) => budgetsController.createNewVersion(req, res));

export default router;
