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

import coreRoutes from '../modules/core/apiRoutes/v1/coreApiRoutes.js';
import activitiesRoutes from '../modules/activities/apiRoutes/v1/activitiesApiRoutes.js';
import tenantsRoutes from '../modules/tenants/apiRoutes/v1/tenantsApiRoutes.js';
import arRoutes from '../modules/ar/apiRoutes/v1/arApiRoutes.js';
import apRoutes from '../modules/ap/apiRoutes/v1/apApiRoutes.js';
import accountingRoutes from '../modules/accounting/apiRoutes/v1/accountingApiRoutes.js';
import projectsRoutes from '../modules/projects/apiRoutes/v1/projectsApiRoutes.js';
import bomApiRoutes from '../modules/bom/apiRoutes/v1/bomApiRoutes.js';

const router = express.Router();

router.use('/core', coreRoutes);
router.use('/activities', activitiesRoutes);
router.use('/tenants', tenantsRoutes);
router.use('/ar', arRoutes);
router.use('/ap', apRoutes);
router.use('/accounting', accountingRoutes);
router.use('/projects', projectsRoutes); 
router.use('/bom', bomApiRoutes); 
// Add more routes as needed

export default router;
