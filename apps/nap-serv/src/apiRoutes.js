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
import bomRoutes from '../Modules/bom/apiRoutes/v1/bomApiRoutes.js';
import apRoutes from '../Modules/ap/apiRoutes/v1/apApiRoutes.js';

const router = Router();

router.use('/tenants', tenantsRoutes);
router.use('/core', coreRoutes);
router.use('/projects', projectsRoutes);
router.use('/activities', activitiesRoutes);
router.use('/bom', bomRoutes);
router.use('/ap', apRoutes);

export default router;
