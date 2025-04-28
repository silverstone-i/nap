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

// Create a category
router.post('/category', CategoryController.create);

// Get all categories
router.get('/category', CategoryController.getAll);

// Get a specific category by ID
router.get('/category/:id', CategoryController.getById);

// Update a category by ID
router.put('/category/:id', CategoryController.update);

// Delete a category by ID
router.delete('/category/:id', CategoryController.remove);

export default router;
