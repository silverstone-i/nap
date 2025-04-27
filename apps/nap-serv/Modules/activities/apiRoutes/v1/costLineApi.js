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
import CostLineController from '../../controllers/CostLineController.js';

const router = express.Router();

// Create a cost line
router.post('/', CostLineController.create);

// Get all cost lines
router.get('/', CostLineController.getAll);

// Get a specific cost line by ID
router.get('/:id', CostLineController.getById);

// Update a cost line by ID
router.put('/:id', CostLineController.update);

// Delete a cost line by ID
router.delete('/:id', CostLineController.remove);

export default router;
