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
import ActivityController from '../../controllers/ActivityController.js';

const router = express.Router();

router.use((req, res, next) => {
  console.log('Request URL:', req.originalUrl);
  console.log('Request Method:', req.method);
  next();
});

router
  .route('/')
  .post(ActivityController.create)
  .get(ActivityController.getAll);

router
  .route('/:id')
  .get(ActivityController.getById)
  .put(ActivityController.update)
  .delete(ActivityController.remove);

export default router;
