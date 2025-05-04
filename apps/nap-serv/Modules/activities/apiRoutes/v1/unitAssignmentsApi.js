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
import UnitAssignmentsController from '../../controllers/UnitAssignmentsController.js';

const router = express.Router();

router
  .route('/')
  .post(UnitAssignmentsController.create)
  .get(UnitAssignmentsController.getAll);

router
  .route('/:id')
  .get(UnitAssignmentsController.getById)
  .put(UnitAssignmentsController.update)
  .delete(UnitAssignmentsController.remove);

export default router;
