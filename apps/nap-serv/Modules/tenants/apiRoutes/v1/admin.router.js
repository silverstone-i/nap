'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import express from 'express';
import db from '../../../../src/db/db.js';
import { assumeTenant, exitAssumption } from '../../../../modules/core/controllers/admin.controller.js';

const router = express.Router();

function deprecate(req, _res, next) {
  console.warn('[DEPRECATION] /api/tenants/v1/admin/* is now served by core. Please switch to /api/v1/admin/*');
  next();
}

// Legacy endpoints expected by tests
router.get('/schemas', deprecate, async (req, res) => {
  try {
    const tenants = await db('tenants', 'admin').findAll();
    const schemas = Array.from(new Set(['admin', ...tenants.map((t) => t.tenant_code.toLowerCase())]));
    res.json(schemas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/switch-schema/:schema', deprecate, (req, res) => {
  const role = req.user?.role || req.auth?.roles || req.auth?.role;
  const isSuper = role === 'superadmin' || (Array.isArray(role) && role.includes('superadmin'));
  if (!isSuper) return res.status(403).json({ error: 'Forbidden' });
  req.schema = req.params.schema.toLowerCase();
  res.json({ message: `Schema switched to ${req.schema}` });
});

// New endpoints (proxy to core)
router.post('/assume-tenant', deprecate, assumeTenant);
router.post('/exit-assumption', deprecate, exitAssumption);

export default router;
