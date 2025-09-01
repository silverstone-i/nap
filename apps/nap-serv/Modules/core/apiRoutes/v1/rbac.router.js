'use strict';

import express from 'express';
import { loadPoliciesForUserTenant } from '../../../../src/utils/RbacPolicies.js';

const router = express.Router();

// GET /api/core/v1/rbac/effective
router.get('/effective', async (req, res) => {
  const schemaName = req.ctx?.schema || req.user?.schema_name || null;
  const user = req.ctx?.user || req.user || null;
  if (!schemaName || !user?.id) return res.status(400).json({ error: 'schema and user context required' });

  const caps = await loadPoliciesForUserTenant({ schemaName, userId: user.id });
  const policy_etag = req.ctx?.policy_etag || null;
  res.json({ policy_etag, caps });
});

export default router;
