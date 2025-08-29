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
import {
  login as coreLogin,
  refresh as coreRefresh,
  logout as coreLogout,
  me as coreMe,
} from '../../../../modules/core/controllers/auth.controller.js';

const router = express.Router();

function deprecate(req, _res, next) {
  console.warn('[DEPRECATION] /api/tenants/v1/auth/* is now served by core. Please switch to /api/v1/auth/*');
  next();
}

router.post('/login', deprecate, coreLogin);
router.post('/refresh', deprecate, coreRefresh);
router.post('/logout', deprecate, coreLogout);
router.get('/check', deprecate, coreMe);

export default router;
