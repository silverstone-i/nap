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
import catalogSkusRouter from './catalogSkusRouter.js';
import vendorSkusRouter from './vendorSkusRouter.js';

const router = express.Router();

router.use('/v1/catalog-skus', catalogSkusRouter);
router.use('/v1/vendor-skus', vendorSkusRouter);

export default router;