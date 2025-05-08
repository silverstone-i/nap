'use strict';

import 'dotenv/config';
import express from 'express';

import coreRoutes from '../modules/core/apiRoutes/v1/coreApiRoutes.js';
import activitiesRoutes from '../modules/activities/apiRoutes/v1/activitiesApiRoutes.js';
import tenantsRoutes from '../modules/tenants/apiRoutes/v1/tenantsApiRoutes.js';
import arRoutes from '../modules/ar/apiRoutes/v1/arApiRoutes.js';

const router = express.Router();

router.use('/core', coreRoutes);
router.use('/activities', activitiesRoutes);
router.use('/tenants', tenantsRoutes);
router.use('/ar', arRoutes);
// Add more routes as needed

export default router;
