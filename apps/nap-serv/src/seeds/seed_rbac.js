'use strict';

import db from '../db/db.js';

export async function seedRbac({ schemaName, createdBy = 'seed-rbac' }) {
  console.log('Seeding RBAC for tenant:', schemaName);

  // System roles (tenant_code NULL)
  const schema = schemaName ? schemaName.toLowerCase() : 'public';
  // For admin schema, system roles should have tenant_code NULL; for others, use tenant code
  const tenantCode = schema === 'admin' ? null : (schemaName?.toUpperCase() ?? null);
  const isAdminSchema = schema === 'admin';

  // Ensure RBAC tables exist in target schema
  // Tables must already exist; migrations/bootstrap create them

  const roleCodesToCheck = (isAdminSchema ? ['super_admin', 'admin'] : ['admin']).concat(tenantCode ? ['project_manager'] : []);
  const existing = await db('roles', schema).findWhere([{ code: { $in: roleCodesToCheck } }], 'AND');
  const haveCodes = new Set(existing.map((r) => r.code));

  if (isAdminSchema && !haveCodes.has('super_admin')) {
    await db('roles', schema).insert({
      code: 'super_admin',
      name: 'Super Admin',
      tenant_code: tenantCode,
      is_system: true,
      is_immutable: true,
      created_by: createdBy,
    });
  }
  if (!haveCodes.has('admin')) {
    await db('roles', schema).insert({
      code: 'admin',
      name: 'Tenant Admin',
      tenant_code: tenantCode,
      is_system: true,
      is_immutable: true,
      created_by: createdBy,
    });
  }

  if (tenantCode) {
    // Create tenant role project_manager
    let pm;
    if (!haveCodes.has('project_manager')) {
      pm = await db('roles', schema).insert({
        tenant_code: tenantCode,
        code: 'project_manager',
        name: 'Project Manager',
        created_by: createdBy,
      });
    } else {
      pm = await db('roles', schema).findOneBy([{ code: 'project_manager' }]);
    }

    // Seed policies per prompt
    const policies = [
      { tenant_code: tenantCode, role_id: pm.id, module: 'projects', router: null, action: null, level: 'full' },
      { tenant_code: tenantCode, role_id: pm.id, module: 'gl', router: null, action: null, level: 'view' },
      { tenant_code: tenantCode, role_id: pm.id, module: 'ar', router: null, action: null, level: 'view' },
      { tenant_code: tenantCode, role_id: pm.id, module: 'ar', router: 'invoices', action: 'approve', level: 'none' },
    ];
    for (const p of policies) {
      await db('policies', schema).insert({ ...p, created_by: createdBy });
    }
  }
}

export default seedRbac;
