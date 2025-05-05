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
import TenantsController from '../../controllers/TenantsController.js';

const router = express.Router();

router
  .route('/')
  .post(TenantsController.create)
  .get(TenantsController.getAll);

router
  .route('/:id')
  .get(TenantsController.getById)
  .put(TenantsController.update)
  .delete(TenantsController.remove);

router
  .route('/:id/modules')
  .get(TenantsController.getAllAllowedModules);

export default router;
