

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
import VendorPartsController from '../../controllers/VendorPartsController.js';

const router = express.Router();

router.post('/vendor-part', VendorPartsController.create);
router.get('/vendor-part', VendorPartsController.getAll);
router.get('/vendor-part/:id', VendorPartsController.getById);
router.put('/vendor-part/:id', VendorPartsController.update);
router.delete('/vendor-part/:id', VendorPartsController.remove);

export default router;