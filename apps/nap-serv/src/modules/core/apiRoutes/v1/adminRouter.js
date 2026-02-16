/**
 * @file Core admin router — tenant assumption per PRD §3.2.3
 * @module core/apiRoutes/v1/adminRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';

const router = Router();

/**
 * POST /assume-tenant — assume another tenant's context (super_user only)
 */
router.post('/assume-tenant', (req, res) => {
  const { tenant_code, reason } = req.body || {};
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.role !== 'super_user') return res.status(403).json({ error: 'Forbidden: super_user only' });
  if (!tenant_code) return res.status(400).json({ error: 'tenant_code required' });

  req.ctx = { ...(req.ctx || {}), assumed_tenant: tenant_code, assumption_reason: reason || null };
  return res.json({ message: 'Assumed tenant', tenant_code });
});

/**
 * POST /exit-assumption — exit tenant assumption
 */
router.post('/exit-assumption', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.ctx) {
    delete req.ctx.assumed_tenant;
    delete req.ctx.assumption_reason;
  }
  return res.json({ message: 'Exited assumption' });
});

export default router;
