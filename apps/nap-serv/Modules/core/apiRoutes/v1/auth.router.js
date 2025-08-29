'use strict';

import express from 'express';
import { login, refresh, logout, me } from '../../controllers/auth.controller.js';

const router = express.Router();

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', me);

export default router;
