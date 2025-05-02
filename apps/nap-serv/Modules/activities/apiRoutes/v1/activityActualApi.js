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
import ActivityActualController from '../../controllers/ActivityActualController.js';

const router = express.Router();

router
  .route('/')
  .post(ActivityActualController.create)
  .get(ActivityActualController.getAll);

router
  .route('/:id')
  .get(ActivityActualController.getById)
  .put(ActivityActualController.update)
  .delete(ActivityActualController.remove);

export default router;
