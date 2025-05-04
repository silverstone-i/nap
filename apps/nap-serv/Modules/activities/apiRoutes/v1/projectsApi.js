

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
import ProjectsController from '../../controllers/ProjectsController.js';

const router = express.Router();

router
  .route('/')
  .post(ProjectsController.create)
  .get(ProjectsController.getAll);

router
  .route('/:id')
  .get(ProjectsController.getById)
  .put(ProjectsController.update)
  .delete(ProjectsController.remove);

export default router;