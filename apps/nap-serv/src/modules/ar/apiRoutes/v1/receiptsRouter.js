/**
 * @file Receipts router — /api/ar/v1/receipts
 * @module ar/apiRoutes/v1/receiptsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import receiptsController from '../../controllers/receiptsController.js';

const meta = withMeta({ module: 'ar', router: 'receipts' });

export default createRouter(receiptsController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
