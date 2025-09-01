'use strict';

import express from 'express';
import { loadPoliciesForUserTenant } from './utils/RbacPolicies.js';
import authRouter from '../modules/core/apiRoutes/v1/auth.router.js';
import adminRouter from '../modules/core/apiRoutes/v1/admin.router.js';

const router = express.Router();

// Mount auth endpoints at /api/v1/auth
router.use('/auth', authRouter);
router.use('/admin', adminRouter);

// NOTE: /api/v1/auth/me is handled by core auth router now.

// GET /api/v1/rbac/effective
router.get('/rbac/effective', async (req, res) => {
  const schemaName = req.ctx?.schema || req.user?.schema_name || null;
  const user = req.ctx?.user || req.user || null;
  if (!schemaName || !user?.id) return res.status(400).json({ error: 'schema and user context required' });

  const caps = await loadPoliciesForUserTenant({ schemaName, userId: user.id });
  const policy_etag = req.ctx?.policy_etag || null;
  res.json({ policy_etag, caps });
});

export default router;
