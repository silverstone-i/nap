/**
 * @file MatchReviewLogs router — /api/tenants/v1/match-review-logs
 * @module tenants/apiRoutes/v1/matchReviewLogsRouter
 *
 * Read-only routes for match review audit logs.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import matchReviewLogsController from '../../controllers/matchReviewLogsController.js';

export default createRouter(matchReviewLogsController, null, {
  disablePost: true,
  disablePut: true,
  disableDelete: true,
  disablePatch: true,
  disableBulkInsert: true,
  disableBulkUpdate: true,
  disableImportXls: true,
});
