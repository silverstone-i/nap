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
import CategoryController from '../../controllers/CategoryController.js';

const router = express.Router();

router
  .route('/')
  .post((req, res) => {
    const { name, created_by } = req.body;
    if (!name || !created_by) {
      return res.status(400).json({ error: 'Name and created_by are required' });
    }
    CategoryController.create(req, res);
  })
  .get(CategoryController.getAll);

router
  .route('/:id')
  .get(CategoryController.getById)
  .put(CategoryController.update)
  .delete(CategoryController.remove);

export default router;
