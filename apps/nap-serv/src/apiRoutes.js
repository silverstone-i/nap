'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import 'dotenv/config';
import express from 'express';

import coreRoutes from '../Modules/core/apiRoutes/v1/coreApiRoutes.js';
import activitiesRoutes from '../Modules/activities/apiRoutes/v1/activitiesApiRoutes.js';
import tenantsRoutes from '../Modules/tenants/apiRoutes/v1/tenantsApiRoutes.js';
import arRoutes from '../Modules/ar/apiRoutes/v1/arApiRoutes.js';
import apRoutes from '../Modules/ap/apiRoutes/v1/apApiRoutes.js';
import accountingRoutes from '../Modules/accounting/apiRoutes/v1/accountingApiRoutes.js';
import projectsRoutes from '../Modules/projects/apiRoutes/v1/projectsApiRoutes.js';
import bomApiRoutes from '../Modules/bom/apiRoutes/v1/bomApiRoutes.js';
import systemV1 from './apiRoutes.v1.system.js';

const router = express.Router();

router.use('/core', coreRoutes);
router.use('/activities', activitiesRoutes);
router.use('/tenants', tenantsRoutes);
router.use('/ar', arRoutes);
router.use('/ap', apRoutes);
router.use('/accounting', accountingRoutes);
router.use('/projects', projectsRoutes);
router.use('/bom', bomApiRoutes);
// top-level v1 for auth/me and rbac/effective
router.use('/v1', systemV1);
// Add more routes as needed

export default router;
