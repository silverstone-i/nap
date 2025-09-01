'use strict';

import express from 'express';

const router = express.Router();

// Admin assumption is schema-less; middleware should allow admin path without schema
router.post('/assume-tenant', (req, res) => {
  const { tenant_code, reason } = req.body || {};
  // Minimal validation; in real impl we'd verify superadmin and issue a short-lived token
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!tenant_code) return res.status(400).json({ error: 'tenant_code required' });
  // Stash assumption context on req.ctx for downstream; token rotation omitted for test scope
  req.ctx = { ...(req.ctx || {}), assumed_tenant: tenant_code, assumption_reason: reason || null };
  return res.json({ message: 'Assumed tenant', tenant_code });
});

router.post('/exit-assumption', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.ctx) {
    delete req.ctx.assumed_tenant;
    delete req.ctx.assumption_reason;
  }
  return res.json({ message: 'Exited assumption' });
});

export default router;
