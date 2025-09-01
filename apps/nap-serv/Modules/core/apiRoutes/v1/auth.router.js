'use strict';

import express from 'express';
import { login, refresh, logout, me } from '../../controllers/auth.controller.js';

const router = express.Router();

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', me);
router.get('/check', (req, res) =>
  req.user ? res.status(200).json({ message: 'Token is valid', user: req.user }) : res.status(401).json({ message: 'Unauthorized' }),
);

export default router;
