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
import { ChangeOrderLineController } from '../../controllers/ChangeOderLineController.js';

const router = express.Router();

router
  .route('/')
  .post(ChangeOrderLineController.create)
  .get(ChangeOrderLineController.getAll);

router
  .route('/:id')
  .get(ChangeOrderLineController.getById)
  .put(ChangeOrderLineController.update)
  .delete(ChangeOrderLineController.remove);

export default router;
