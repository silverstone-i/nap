

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
import AddressesController from '../../controllers/AddressesController.js';

const router = express.Router();

router.post('/address', AddressesController.create);
router.get('/address', AddressesController.getAll);
router.get('/address/:id', AddressesController.getById);
router.put('/address/:id', AddressesController.update);
router.delete('/address/:id', AddressesController.remove);

export default router;