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
import { TenantController } from '../controllers/tenantController.js';

const router = express.Router();

router.post('/', TenantController.create);
router.get('/', TenantController.getAll);
router.get('/:id', TenantController.getById);
router.put('/:id', TenantController.update);
router.delete('/:id', TenantController.remove);

export default router;