/**
 * @file Posting Queues router — /api/accounting/v1/posting-queues
 * @module accounting/apiRoutes/v1/postingQueuesRouter
 *
 * Includes custom POST /retry endpoint for retrying failed posting queue entries.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import createRouter from '../../../../src/lib/createRouter.js';
import { addAuditFields } from '../../../../src/middleware/addAuditFields.js';
import postingQueuesController from '../../controllers/postingQueuesController.js';

const router = Router();

router.post('/retry', addAuditFields, (req, res) => postingQueuesController.retry(req, res));

router.use('/', createRouter(postingQueuesController));

export default router;
