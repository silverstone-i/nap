

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

router.post('/project', ProjectController.create);
router.get('/project', ProjectController.getAll);
router.get('/project/:id', ProjectController.getById);
router.put('/project/:id', ProjectController.update);
router.delete('/project/:id', ProjectController.remove);

export default router;