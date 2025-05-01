

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
import ActivityBudgetController from '../../controllers/ActivityBudgetController.js';

const router = express.Router();

router.post('/activity-budget', ActivityBudgetController.create);
router.get('/activity-budget', ActivityBudgetController.getAll);
router.get('/activity-budget/:id', ActivityBudgetController.getById);
router.put('/activity-budget/:id', ActivityBudgetController.update);
router.delete('/activity-budget/:id', ActivityBudgetController.remove);

export default router;