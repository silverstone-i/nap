'use strict';

import express from 'express';

const router = express.Router();

// Simple in-memory schema list for prototype/testing
const schemas = ['admin', 'nap', 'ciq', 'test'];

// GET /schemas - list available schemas
router.get('/schemas', (req, res) => {
  return res.json(schemas);
});

// POST /switch-schema/:schema - superadmin-only, ack switch
router.post('/switch-schema/:schema', (req, res) => {
  const isSuper = req.ctx?.is_superadmin || req.user?.role?.toLowerCase?.() === 'superadmin';
  if (!isSuper) return res.status(403).json({ error: 'Forbidden' });

  const { schema } = req.params;
  // No real switching here; requestContext reads X-Tenant-Code for override.
  return res.json({ message: `Schema switched to ${schema}` });
});

export default router;
