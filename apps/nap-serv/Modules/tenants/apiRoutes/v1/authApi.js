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
  login,
  refreshToken,
  logout,
  // register,
  checkToken,
} from '../../controllers/auth.controller.js';

const router = express.Router();

router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
// router.post('/register', register);
router.get('/check', checkToken);

export default router;
