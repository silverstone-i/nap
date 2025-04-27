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

// Create an activity
router.post('/', ActivityController.create);

// Get all activities
router.get('/', ActivityController.getAll);

// Get a specific activity by ID
router.get('/:id', ActivityController.getById);

// Update an activity by ID
router.put('/:id', ActivityController.update);

// Delete an activity by ID
router.delete('/:id', ActivityController.remove);

export default router;