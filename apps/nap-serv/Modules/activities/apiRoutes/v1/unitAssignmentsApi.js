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
import { UnitAssignmentController } from '../../controllers/UnitAssignmentController.js';

const router = express.Router();

router
  .route('/')
  .post(UnitAssignmentController.create)
  .get(UnitAssignmentController.getAll);

router
  .route('/:id')
  .get(UnitAssignmentController.getById)
  .put(UnitAssignmentController.update)
  .delete(UnitAssignmentController.remove);

export default router;
