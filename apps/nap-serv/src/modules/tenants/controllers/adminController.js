/**
 * @file Admin controller — schema listing and context switching per PRD §3.2.3
 * @module tenants/controllers/adminController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import db from '../../../db/db.js';

/**
 * GET /schemas — list all tenant schemas (super_user only)
 */
export async function getAllSchemas(req, res) {
  const isSuperAdmin = req.user?.role === 'super_admin';
  if (!isSuperAdmin) return res.status(403).json({ error: 'Forbidden: super_user only' });

  try {
    const tenants = await db('tenants', 'admin').findWhere([], 'AND', {
      columnWhitelist: ['tenant_code', 'schema_name'],
      includeDeactivated: true,
    });
    const list = tenants.map((t) => (t.schema_name || t.tenant_code || '').toLowerCase());
    if (!list.includes('admin')) list.unshift('admin');
    return res.json(list);
  } catch {
    return res.status(500).json({ error: 'Database error' });
  }
}

/**
 * POST /switch-schema/:schema — switch tenant context
 */
export function switchSchema(req, res) {
  const isSuperAdmin = req.user?.role === 'super_admin';
  if (!isSuperAdmin) return res.status(403).json({ error: 'Forbidden: super_user only' });

  const { schema } = req.params;
  if (!schema) return res.status(400).json({ error: 'schema parameter required' });

  return res.json({ message: `Schema switched to ${schema}`, schema });
}

export default { getAllSchemas, switchSchema };
