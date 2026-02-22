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
import tenantsApiRoutes from './modules/tenants/apiRoutes/v1/tenantsApiRoutes.js';

const router = Router();

// Auth routes (public: login/refresh/logout; protected: me/check/change-password)
router.use('/auth', authRouter);

// Tenant management routes (NapSoft-only: tenants, nap-users, admin operations)
router.use('/tenants', tenantsApiRoutes);

export default router;
