

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
import AddressesController from '../../controllers/AddressController.js';

const router = express.Router();

router
  .route('/')
  .post(AddressesController.create)
  .get(AddressesController.getAll);

router
  .route('/:id')
  .get(AddressesController.getById)
  .put(AddressesController.update)
  .delete(AddressesController.remove);

export default router;