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
import ActivitiesController from '../../controllers/ActivitiesController.js';

const router = express.Router();

router
  .route('/')
  .post(ActivitiesController.create)
  .get(ActivitiesController.getAll);

router
  .route('/:id')
  .get(ActivitiesController.getById)
  .put(ActivitiesController.update)
  .delete(ActivitiesController.remove);

export default router;
