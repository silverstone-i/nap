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
import coreApiRoutes from './modules/core/apiRoutes/v1/coreApiRoutes.js';
import projectsApiRoutes from '../Modules/projects/apiRoutes/v1/projectsApiRoutes.js';
import activitiesApiRoutes from '../Modules/activities/apiRoutes/v1/activitiesApiRoutes.js';
import bomApiRoutes from '../Modules/bom/apiRoutes/v1/bomApiRoutes.js';

const router = Router();

// Auth routes (public: login/refresh/logout; protected: me/check/change-password)
router.use('/auth', authRouter);

// Tenant management routes (NapSoft-only: tenants, nap-users, admin operations)
router.use('/tenants', tenantsApiRoutes);

// Core entity routes (tenant-scope: vendors, clients, employees, contacts, etc.)
router.use('/core', coreApiRoutes);

// Projects module routes (tenant-scope: projects, units, tasks, cost-items, etc.)
router.use('/projects', projectsApiRoutes);

// Activities module routes (tenant-scope: categories, activities, deliverables, budgets, etc.)
router.use('/activities', activitiesApiRoutes);

// BOM module routes (tenant-scope: catalog-skus, vendor-skus, vendor-pricing)
router.use('/bom', bomApiRoutes);

export default router;
