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

router
  .route('/')
  .post(ActivityBudgetController.create)
  .get(ActivityBudgetController.getAll);

router
  .route('/:id')
  .get(ActivityBudgetController.getById)
  .put(ActivityBudgetController.update)
  .delete(ActivityBudgetController.remove);

export default router;
