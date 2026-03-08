/**
 * @file AP Invoice Lines router — /api/ap/v1/ap-invoice-lines
 * @module ap/apiRoutes/v1/apInvoiceLinesRouter
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import apInvoiceLinesController from '../../controllers/apInvoiceLinesController.js';

const meta = withMeta({ module: 'ap', router: 'ap-invoice-lines' });

export default createRouter(apInvoiceLinesController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
