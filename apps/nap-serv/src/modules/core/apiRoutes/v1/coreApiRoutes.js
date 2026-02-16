/**
 * @file Core module route aggregator — mounts core sub-routers under /api/core
 * @module core/apiRoutes/v1/coreApiRoutes
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import adminRouter from './adminRouter.js';

const router = Router();

router.use('/v1/admin', adminRouter);

export default router;
