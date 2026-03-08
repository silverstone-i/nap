/**
 * @file AP Credit Memos router — /api/ap/v1/ap-credit-memos
 * @module ap/apiRoutes/v1/apCreditMemosRouter
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import apCreditMemosController from '../../controllers/apCreditMemosController.js';

const meta = withMeta({ module: 'ap', router: 'ap-credit-memos' });

export default createRouter(apCreditMemosController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
