'use strict';

import 'dotenv/config';
import express from 'express';

import coreRoutes from '../modules/core/apiRoutes/v1/coreApiRoutes.js';
import activitiesRoutes from '../modules/activities/apiRoutes/v1/activitiesApiRoutes.js';
import tenantsRoutes from '../modules/tenants/apiRoutes/v1/tenantsApiRoutes.js';

const router = express.Router();

router.use('/core', coreRoutes);
router.use('/activities', activitiesRoutes);
router.use('/tenants', tenantsRoutes);

export default router;
