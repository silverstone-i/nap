/**
 * @file Auth routes — login, refresh, logout, me, check, change-password per PRD §3.1.1
 * @module auth/apiRoutes/v1/authRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import { login, refresh, logout, me, check, changePassword } from '../../controllers/authController.js';

const router = Router();

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/change-password', changePassword);
router.get('/me', me);
router.get('/check', check);

export default router;
