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
import ChangeOrderLinesController from '../../controllers/ChangeOrderLinesController.js';

const router = express.Router();

router
  .route('/')
  .post(ChangeOrderLinesController.create)
  .get(ChangeOrderLinesController.getAll);

router
  .route('/:id')
  .get(ChangeOrderLinesController.getById)
  .put(ChangeOrderLinesController.update)
  .delete(ChangeOrderLinesController.remove);

export default router;
