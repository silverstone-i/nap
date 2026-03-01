/**
 * @file Payments router — /api/ap/v1/payments
 * @module ap/apiRoutes/v1/paymentsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import paymentsController from '../../controllers/paymentsController.js';

const meta = withMeta({ module: 'ap', router: 'payments' });

export default createRouter(paymentsController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
