/**
 * @file AP Invoices router — /api/ap/v1/ap-invoices
 * @module ap/apiRoutes/v1/apInvoicesRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import apInvoicesController from '../../controllers/apInvoicesController.js';

const meta = withMeta({ module: 'ap', router: 'ap-invoices' });

export default createRouter(apInvoicesController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
