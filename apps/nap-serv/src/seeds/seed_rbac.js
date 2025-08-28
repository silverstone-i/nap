'use strict';

import db from '../db/db.js';

export async function seedRbac({ tenantId, tenantCode, createdBy = 'seed-rbac' }) {
  // System roles (tenant_id NULL)
  const publicSchema = 'public';

  const existing = await db('roles', publicSchema).findWhere([{ tenant_id: null }, { code: { $in: ['superadmin', 'admin'] } }], 'AND');
  const haveCodes = new Set(existing.map((r) => r.code));

  if (!haveCodes.has('superadmin')) {
    await db('roles', publicSchema).insert({
      code: 'superadmin',
      name: 'Super Admin',
      tenant_id: null,
      tenant_code: null,
      is_system: true,
      is_immutable: true,
      created_by: createdBy,
    });
  }
  if (!haveCodes.has('admin')) {
    await db('roles', publicSchema).insert({
      code: 'admin',
      name: 'Tenant Admin',
      tenant_id: null,
      tenant_code: null,
      is_system: true,
      is_immutable: true,
      created_by: createdBy,
    });
  }

  if (tenantId && tenantCode) {
    // Create tenant role project_manager
    const pm = await db('roles', publicSchema).insert({
      tenant_id: tenantId,
      tenant_code: tenantCode,
      code: 'project_manager',
      name: 'Project Manager',
      created_by: createdBy,
    });

    // Seed policies per prompt
    const policies = [
      { tenant_id: tenantId, tenant_code: tenantCode, role_id: pm.id, module: 'projects', router: null, action: null, level: 'full' },
      { tenant_id: tenantId, tenant_code: tenantCode, role_id: pm.id, module: 'gl', router: null, action: null, level: 'view' },
      { tenant_id: tenantId, tenant_code: tenantCode, role_id: pm.id, module: 'ar', router: null, action: null, level: 'view' },
      { tenant_id: tenantId, tenant_code: tenantCode, role_id: pm.id, module: 'ar', router: 'invoices', action: 'approve', level: 'none' },
    ];
    for (const p of policies) {
      await db('policies', publicSchema).insert({ ...p, created_by: createdBy });
    }
  }
}

export default seedRbac;
