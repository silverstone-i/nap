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

const router = express.Router();

router
  .route('/')
  .post(CostLinesController.create)
  .get(CostLinesController.getAll);

router
  .route('/:id')
  .get(CostLinesController.getById)
  .put(CostLinesController.update)
  .delete(CostLinesController.remove);

export default router;
