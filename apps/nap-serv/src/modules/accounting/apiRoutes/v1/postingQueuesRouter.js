/**
 * @file Posting Queues router — /api/accounting/v1/posting-queues
 * @module accounting/apiRoutes/v1/postingQueuesRouter
 *
 * Includes custom POST /retry endpoint for retrying failed posting queue entries.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import createRouter from '../../../../lib/createRouter.js';
import { addAuditFields } from '../../../../middleware/addAuditFields.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import { moduleEntitlement } from '../../../../middleware/moduleEntitlement.js';
import postingQueuesController from '../../controllers/postingQueuesController.js';

const router = Router();
const meta = withMeta({ module: 'accounting', router: 'posting-queues' });

router.post('/retry', meta, moduleEntitlement, addAuditFields, (req, res) => postingQueuesController.retry(req, res));

router.use('/', createRouter(postingQueuesController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
}));

export default router;
