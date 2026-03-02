/**
 * @file Journal Entries router — /api/accounting/v1/journal-entries
 * @module accounting/apiRoutes/v1/journalEntriesRouter
 *
 * Includes custom POST /post and POST /reverse endpoints
 * mounted before the standard CRUD routes.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import createRouter from '../../../../lib/createRouter.js';
import { addAuditFields } from '../../../../middleware/addAuditFields.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import { moduleEntitlement } from '../../../../middleware/moduleEntitlement.js';
import journalEntriesController from '../../controllers/journalEntriesController.js';

const router = Router();
const meta = withMeta({ module: 'accounting', router: 'journal-entries' });

router.post('/post', meta, moduleEntitlement, addAuditFields, (req, res) => journalEntriesController.post(req, res));
router.post('/reverse', meta, moduleEntitlement, addAuditFields, (req, res) => journalEntriesController.reverse(req, res));

router.use('/', createRouter(journalEntriesController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
}));

export default router;
