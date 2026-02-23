/**
 * @file Journal Entry Lines router — /api/accounting/v1/journal-entry-lines
 * @module accounting/apiRoutes/v1/journalEntryLinesRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import journalEntryLinesController from '../../controllers/journalEntryLinesController.js';

export default createRouter(journalEntryLinesController);
