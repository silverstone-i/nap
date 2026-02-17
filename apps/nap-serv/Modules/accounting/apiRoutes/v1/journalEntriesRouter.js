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
import createRouter from '../../../../src/lib/createRouter.js';
import { addAuditFields } from '../../../../src/middleware/addAuditFields.js';
import journalEntriesController from '../../controllers/journalEntriesController.js';

const router = Router();

// Custom POST routes for posting and reversal
router.post('/post', addAuditFields, (req, res) => journalEntriesController.post(req, res));
router.post('/reverse', addAuditFields, (req, res) => journalEntriesController.reverse(req, res));

// Standard CRUD routes
router.use('/', createRouter(journalEntriesController));

export default router;
