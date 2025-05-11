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
import CostLinesController from '../../controllers/CostLinesController.js';

import createRouter from '../../../../src/utils/createRouter.js';

const router = createRouter(CostLinesController);

router.route('/lock/:unitBudgetId').post((req, res) => CostLinesController.lockByUnitBudget(req, res));

export default router;
