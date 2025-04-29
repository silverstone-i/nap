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
import TenantController from '../../controllers/TenantController.js';

const router = express.Router();

router
  .route('/')
  .post(TenantController.create)
  .get(TenantController.getAll);

router
  .route('/:id')
  .get(TenantController.getById)
  .put(TenantController.update)
  .delete(TenantController.remove);

router
  .route('/:id/modules')
  .get(TenantController.getAllAllowedModules);

export default router;
