/**
 * @file AR Invoice Lines router — /api/ar/v1/ar-invoice-lines
 * @module ar/apiRoutes/v1/arInvoiceLinesRouter
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import arInvoiceLinesController from '../../controllers/arInvoiceLinesController.js';

const meta = withMeta({ module: 'ar', router: 'ar-invoice-lines' });

export default createRouter(arInvoiceLinesController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
