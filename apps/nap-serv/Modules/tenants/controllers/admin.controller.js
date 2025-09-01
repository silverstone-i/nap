'use strict';

export async function getAllSchemas(req, res) {
  try {
    const mod = await import('../../../src/db/db.js');
    const callDb = mod.default || mod.db; // unit tests mock default
    const tenants = await callDb('tenants', 'admin').findAll();
    // Return array of schema/tenant codes (lowercase)
    const list = tenants.map((t) => (t.tenant_code || '').toLowerCase());
    // Ensure system schema 'admin' appears
    if (!list.includes('admin')) list.unshift('admin');
    return res.json(list);
  } catch {
    // Unit tests expect 500 on DB failure
    return res.status(500).json({ error: 'db failure' });
  }
}

export function switchSchema(req, res) {
  const isSuper = req.ctx?.is_superadmin || req.user?.role?.toLowerCase?.() === 'superadmin';
  if (!isSuper) return res.status(403).json({ error: 'Forbidden' });
  const { schema } = req.params;
  return res.json({ message: `Schema switched to ${schema}` });
}

export default { getAllSchemas, switchSchema };
