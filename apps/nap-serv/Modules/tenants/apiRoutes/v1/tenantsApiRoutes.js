'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import express from 'express';
import TenantsRouter from './TenantsRouter.js';
import NapUsersRouter from './NapUsersRouter.js';
import matchReviewLogsRouter from './matchReviewLogsRouter.js';
import AdminRouter from './admin.router.js';

const router = express.Router();

router.use('/v1/nap-users', NapUsersRouter);
router.use('/v1/tenants', TenantsRouter);
router.use('/v1/match-review-logs', matchReviewLogsRouter);
router.use('/v1/admin', AdminRouter);

export default router;
