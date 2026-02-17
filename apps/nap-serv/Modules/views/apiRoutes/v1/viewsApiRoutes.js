/**
 * @file Views module route aggregator — mounts views router under /api/views
 * @module views/apiRoutes/v1/viewsApiRoutes
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import viewsRouter from './viewsRouter.js';

const router = Router();
router.use('/v1', viewsRouter);

export default router;
