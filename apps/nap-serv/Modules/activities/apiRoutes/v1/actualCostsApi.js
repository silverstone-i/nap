

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
import { ActualCostsController } from '../../controllers/ActualCostsController.js';

const router = express.Router();

router
  .route('/')
  .post(ActualCostsController.create)
  .get(ActualCostsController.getAll);

router
  .route('/:id')
  .get(ActualCostsController.getById)
  .put(ActualCostsController.update)
  .delete(ActualCostsController.remove);

export default router;