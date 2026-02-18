/**
 * @file Sources router — read-only /api/core/v1/sources
 * @module core/apiRoutes/v1/sourcesRouter
 *
 * Sources are auto-created by vendor/client/employee controllers.
 * This router exposes read-only access (GET endpoints only).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import sourcesController from '../../controllers/sourcesController.js';

export default createRouter(sourcesController, null, {
  disablePost: true,
  disablePut: true,
  disableDelete: true,
  disablePatch: true,
  disableBulkInsert: true,
  disableBulkUpdate: true,
  disableImportXls: true,
});
