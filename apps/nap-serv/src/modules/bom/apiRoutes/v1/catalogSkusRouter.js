/**
 * @file CatalogSkus router — /api/bom/v1/catalog-skus
 * @module bom/apiRoutes/v1/catalogSkusRouter
 *
 * Includes custom POST /refresh-embeddings endpoint.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { moduleEntitlement } from '../../../../middleware/moduleEntitlement.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import catalogSkusController from '../../controllers/catalogSkusController.js';

const meta = withMeta({ module: 'bom', router: 'catalog-skus' });

const router = createRouter(catalogSkusController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});

router.post('/refresh-embeddings', meta, moduleEntitlement, (req, res) => catalogSkusController.refreshEmbeddings(req, res));

export default router;
