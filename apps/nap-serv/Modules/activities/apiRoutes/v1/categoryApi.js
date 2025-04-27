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
router.post('/', CategoryController.create);

// Get all categories
router.get('/', CategoryController.getAll);

// Get a specific category by ID
router.get('/:id', CategoryController.getById);

// Update a category by ID
router.put('/:id', CategoryController.update);

// Delete a category by ID
router.delete('/:id', CategoryController.remove);

export default router;
