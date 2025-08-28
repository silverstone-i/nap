'use strict';

import express from 'express';
import { loadPoliciesForUserTenant } from './utils/RbacPolicies.js';

const router = express.Router();

// GET /api/v1/auth/me
router.get('/auth/me', (req, res) => {
  const ctx = req.ctx || {};
  const user = ctx.user || req.user || null;
  const tenant = ctx.tenant || null;
  const system_roles = ctx.system_roles || user?.system_roles || [];
  const tenant_roles = ctx.tenant_roles || [];
  const policy_etag = ctx.policy_etag || null;
  res.json({ user, tenant, system_roles, tenant_roles, policy_etag });
});

// GET /api/v1/rbac/effective
router.get('/rbac/effective', async (req, res) => {
  const tenantId = req.query.tenantId || req.ctx?.tenant?.id || req.user?.tenant_id || null;
  const user = req.ctx?.user || req.user || null;
  if (!tenantId || !user?.id) return res.status(400).json({ error: 'tenantId and user context required' });

  const caps = await loadPoliciesForUserTenant({ tenantId, userId: user.id });
  const policy_etag = req.ctx?.policy_etag || null;
  res.json({ policy_etag, caps });
});

export default router;
