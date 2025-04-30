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
import VendorController from '../../controllers/VendorController.js';

const router = express.Router();

router
  .route('/')
  .post(VendorController.create)
  .get(VendorController.getAll);

router
  .route('/:id')
  .get(VendorController.getById)
  .put(VendorController.update)
  .delete(VendorController.remove);

export default router;