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
import ContactController from '../../controllers/ContactController.js';

const router = express.Router();

router.post('/contact', ContactController.create);
router.get('/contact', ContactController.getAll);
router.get('/contact/:id', ContactController.getById);
router.put('/contact/:id', ContactController.update);
router.delete('/contact/:id', ContactController.remove);

export default router;
