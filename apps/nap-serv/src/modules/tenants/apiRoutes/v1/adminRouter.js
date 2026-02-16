/**
 * @file Tenants admin router — schema management per PRD §3.2.3
 * @module tenants/apiRoutes/v1/adminRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import { getAllSchemas, switchSchema } from '../../controllers/adminController.js';

const router = Router();

router.get('/schemas', getAllSchemas);
router.post('/switch-schema/:schema', switchSchema);

export default router;
