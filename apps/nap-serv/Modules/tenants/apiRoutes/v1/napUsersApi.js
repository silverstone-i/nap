'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import { Router } from 'express';
import NapUsersController from '../../controllers/NapUsersController.js';

const router = Router();


router
  .route('/')
  .post(NapUsersController.create)
  .get(NapUsersController.getAll);

router
  .route('/:id')
  .get(NapUsersController.getById)
  .put(NapUsersController.update)
  .delete(NapUsersController.remove);

export default router;