

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
import ProjectController from '../../controllers/ProjectController.js';

const router = express.Router();

router
  .route('/')
  .post(ProjectController.create)
  .get(ProjectController.getAll);

router
  .route('/:id')
  .get(ProjectController.getById)
  .put(ProjectController.update)
  .delete(ProjectController.remove);

export default router;