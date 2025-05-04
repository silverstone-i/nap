

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
import UnitsController from '../../controllers/UnitsController.js';

const router = express.Router();

router
  .route('/')
  .post(UnitsController.create)
  .get(UnitsController.getAll);

router
  .route('/:id')
  .get(UnitsController.getById)
  .put(UnitsController.update)
  .delete(UnitsController.remove);

export default router;