'use strict';

import express from 'express';
import { login, refreshToken, logout, checkToken } from '../../controllers/auth.controller.js';

const router = express.Router();

router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
router.get('/check', checkToken);

export default router;
