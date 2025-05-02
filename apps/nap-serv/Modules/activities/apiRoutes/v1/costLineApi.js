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
import CostLineController from '../../controllers/CostLineController.js';

const router = express.Router();

router
  .route('/')
  .post(CostLineController.create)
  .get(CostLineController.getAll);

router
  .route('/:id')
  .get(CostLineController.getById)
  .put(CostLineController.update)
  .delete(CostLineController.remove);

export default router;
