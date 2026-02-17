/**
 * @file Central route registry — mounts all module routes under /api
 * @module nap-serv/apiRoutes
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import tenantsRoutes from './modules/tenants/apiRoutes/v1/tenantsApiRoutes.js';
import coreRoutes from './modules/core/apiRoutes/v1/coreApiRoutes.js';
import projectsRoutes from '../Modules/projects/apiRoutes/v1/projectsApiRoutes.js';
import activitiesRoutes from '../Modules/activities/apiRoutes/v1/activitiesApiRoutes.js';

const router = Router();

router.use('/tenants', tenantsRoutes);
router.use('/core', coreRoutes);
router.use('/projects', projectsRoutes);
router.use('/activities', activitiesRoutes);

export default router;
