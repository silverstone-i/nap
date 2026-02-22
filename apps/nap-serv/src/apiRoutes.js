/**
 * @file Central route registry — mounts all module routes under /api
 * @module nap-serv/apiRoutes
 *
 * Routes are added here as each phase is implemented.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import authRouter from './modules/auth/apiRoutes/v1/authRouter.js';

const router = Router();

// Auth routes (public: login/refresh/logout; protected: me/check/change-password)
router.use('/auth', authRouter);

export default router;
