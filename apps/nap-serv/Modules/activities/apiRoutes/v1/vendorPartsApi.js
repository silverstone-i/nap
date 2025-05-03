

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
import VendorPartsController from '../../controllers/VendorPartsController.js';

const router = express.Router();

router
  .route('/')
  .post(VendorPartsController.create)
  .get(VendorPartsController.getAll);

router
  .route('/:id')
  .get(VendorPartsController.getById)
  .put(VendorPartsController.update)
  .delete(VendorPartsController.remove);

export default router;