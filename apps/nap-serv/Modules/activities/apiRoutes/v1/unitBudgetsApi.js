

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
import { UnitBudgetController } from '../../controllers/UnitBudgetController.js';

const router = express.Router();

router
  .route('/')
  .post(UnitBudgetController.create)
  .get(UnitBudgetController.getAll);

router
  .route('/:id')
  .get(UnitBudgetController.getById)
  .put(UnitBudgetController.update)
  .delete(UnitBudgetController.remove);

export default router;