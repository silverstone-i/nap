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

router
.route('/')
.post(ContactController.create)
.get(ContactController.getAll);

router
.route('/:id')
.get(ContactController.getById)
.put(ContactController.update)
.delete(ContactController.remove);

export default router;
