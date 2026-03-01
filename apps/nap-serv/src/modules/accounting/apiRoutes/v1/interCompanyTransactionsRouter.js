/**
 * @file Inter-Company Transactions router — /api/accounting/v1/inter-company-transactions
 * @module accounting/apiRoutes/v1/interCompanyTransactionsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import interCompanyTransactionsController from '../../controllers/interCompanyTransactionsController.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'accounting', router: 'inter-company-transactions' });

export default createRouter(interCompanyTransactionsController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
