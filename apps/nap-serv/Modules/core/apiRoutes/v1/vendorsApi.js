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
import VendorsController from '../../controllers/VendorsController.js';

const router = express.Router();

router
  .route('/')
  .post(VendorsController.create)
  .get(VendorsController.getAll);

router
  .route('/:id')
  .get(VendorsController.getById)
  .put(VendorsController.update)
  .delete(VendorsController.remove);

export default router;