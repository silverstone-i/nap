

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
import ActivityActualController from '../../controllers/ActivityActualController.js';

const router = express.Router();

router.post('/activity-actual', ActivityActualController.create);
router.get('/activity-actual', ActivityActualController.getAll);
router.get('/activity-actual/:id', ActivityActualController.getById);
router.put('/activity-actual/:id', ActivityActualController.update);
router.delete('/activity-actual/:id', ActivityActualController.remove);

export default router;