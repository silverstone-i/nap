/**
 * @file Tenants admin router — schema listing, impersonation per PRD §3.2.3
 * @module tenants/apiRoutes/v1/adminRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import { requireNapsoftTenant } from '../../../../middleware/requireNapsoftTenant.js';
import {
  getAllSchemas,
  startImpersonation,
  endImpersonation,
  getImpersonationStatus,
} from '../../controllers/adminController.js';

const router = Router();

router.get('/schemas', requireNapsoftTenant, getAllSchemas);
router.post('/impersonate', requireNapsoftTenant, startImpersonation);
router.post('/exit-impersonation', endImpersonation);
router.get('/impersonation-status', getImpersonationStatus);

export default router;
