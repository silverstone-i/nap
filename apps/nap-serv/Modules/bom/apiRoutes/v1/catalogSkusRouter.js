/**
 * @file CatalogSkus router — /api/bom/v1/catalog-skus
 * @module bom/apiRoutes/v1/catalogSkusRouter
 *
 * Includes custom POST /refresh-embeddings endpoint.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import catalogSkusController from '../../controllers/catalogSkusController.js';

const router = createRouter(catalogSkusController);

router.post('/refresh-embeddings', (req, res) => catalogSkusController.refreshEmbeddings(req, res));

export default router;
