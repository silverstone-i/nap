'use strict';

import express from 'express';
import { getAllSchemas, switchSchema } from '../../controllers/admin.controller.js';

const router = express.Router();

// No legacy shims; expect req.ctx and req.user to be present when needed

router.get('/schemas', getAllSchemas);
router.post('/switch-schema/:schema', switchSchema);

export default router;
