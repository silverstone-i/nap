/**
 * @file Reports module route aggregator — mounts reports router under /api/reports
 * @module reports/apiRoutes/v1/reportsApiRoutes
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import reportsRouter from './reportsRouter.js';

const router = Router();
router.use('/v1', reportsRouter);

export default router;
