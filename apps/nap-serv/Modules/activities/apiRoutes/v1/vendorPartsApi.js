

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
import VendorPartController from '../../controllers/VendorPartController.js';

const router = express.Router();

router
  .route('/')
  .post(VendorPartController.create)
  .get(VendorPartController.getAll);

router
  .route('/:id')
  .get(VendorPartController.getById)
  .put(VendorPartController.update)
  .delete(VendorPartController.remove);

export default router;