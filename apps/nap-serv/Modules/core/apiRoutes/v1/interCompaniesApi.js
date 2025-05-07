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
import InterCompaniesController from '../../controllers/InterCompaniesController.js';

const router = express.Router();

router
.route('/')
.post(InterCompaniesController.create)
.get(InterCompaniesController.getAll);

router
.route('/:id')
.get(InterCompaniesController.getById)
.put(InterCompaniesController.update)
.delete(InterCompaniesController.remove);

export default router;
