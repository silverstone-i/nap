'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import express from 'express';
import TenantsControllerRouter from './TenantsControllerRouter.js';
import NapUsersControllerRouter from './NapUsersControllerRouter.js';
import authControllerRouter from './auth.controller.router.js';
import adminCotrollerRouter from './admin.controller.router.js';

const router = express.Router();

router.use('/v1/nap-users', NapUsersControllerRouter);
router.use('/v1/tenants', TenantsControllerRouter);
router.use('/v1/auth', authControllerRouter);
router.use('/v1/admin', adminCotrollerRouter);

console.log('Loaded tenantsApi router');

export default router;
