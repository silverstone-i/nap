

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
import { UnitController } from '../../controllers/UnitController.js';

const router = express.Router();

router
  .route('/')
  .post(UnitController.create)
  .get(UnitController.getAll);

router
  .route('/:id')
  .get(UnitController.getById)
  .put(UnitController.update)
  .delete(UnitController.remove);

export default router;