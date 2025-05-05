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
import ContactsController from '../../controllers/ContactsController.js';

const router = express.Router();

router
.route('/')
.post(ContactsController.create)
.get(ContactsController.getAll);

router
.route('/:id')
.get(ContactsController.getById)
.put(ContactsController.update)
.delete(ContactsController.remove);

export default router;
