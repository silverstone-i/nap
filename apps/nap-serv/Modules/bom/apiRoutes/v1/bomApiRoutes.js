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
import catalogItemsRouter from './catalogSkusRouter.js';
import catalogVendorMatchesRouter from './catalogVendorMatchesRouter.js';
import embeddingsRouter from './embeddingRouter.js'; 
import vendorItemsRouter from './vendorSkusRouter.js';

const router = express.Router();

router.use('/v1/catalog-items', catalogItemsRouter);
router.use('/v1/catalog-vendor-matches', catalogVendorMatchesRouter);
router.use('/v1/embeddings', embeddingsRouter);
router.use('/v1/vendor-items', vendorItemsRouter);

export default router;