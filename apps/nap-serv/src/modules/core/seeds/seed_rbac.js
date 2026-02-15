/**
 * @file Seeds RBAC system roles and policies per module
 * @module core/seeds/seed_rbac
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import db from '../../../db/db.js';

export async function seedRbac({ schemaName, createdBy = null }) {
  console.log('Seeding RBAC for schema:', schemaName);

  const schema = schemaName ? schemaName.toLowerCase() : 'public';
  const isAdminSchema = schema === 'admin';

  // Check that roles table exists in target schema
  const rolesRegclass = await db.oneOrNone('SELECT to_regclass($1) AS exists', [`${schema}.roles`]);
  if (!rolesRegclass?.exists) {
    console.warn(`Skipping RBAC seeding for schema "${schema}" because roles table is missing.`);
    return;
  }

  const roleCodesToCheck = isAdminSchema ? ['super_admin', 'admin'] : ['admin', 'project_manager'];
  const existing = await db('roles', schema).findWhere([{ code: { $in: roleCodesToCheck } }], 'AND');
  const haveCodes = new Set(existing.map((r) => r.code));

  // System roles
  if (isAdminSchema && !haveCodes.has('super_admin')) {
    await db('roles', schema).insert({
      code: 'super_admin',
      name: 'Super Admin',
      is_system: true,
      is_immutable: true,
      created_by: createdBy,
    });
  }

  if (!haveCodes.has('admin')) {
    await db('roles', schema).insert({
      code: 'admin',
      name: 'Tenant Admin',
      is_system: true,
      is_immutable: true,
      created_by: createdBy,
    });
  }

  // Tenant-specific roles and policies
  if (!isAdminSchema) {
    let pm;
    if (!haveCodes.has('project_manager')) {
      pm = await db('roles', schema).insert({
        code: 'project_manager',
        name: 'Project Manager',
        created_by: createdBy,
      });
    } else {
      pm = await db('roles', schema).findOneBy([{ code: 'project_manager' }]);
    }

    // Seed policies per PRD §3.7 RBAC hierarchy
    const policies = [
      { role_id: pm.id, module: 'projects', router: null, action: null, level: 'full' },
      { role_id: pm.id, module: 'gl', router: null, action: null, level: 'view' },
      { role_id: pm.id, module: 'ar', router: null, action: null, level: 'view' },
      { role_id: pm.id, module: 'ar', router: 'invoices', action: 'approve', level: 'none' },
    ];

    for (const p of policies) {
      const data = { ...p, created_by: createdBy };
      try {
        await db('policies', schema).insert(data);
      } catch (e) {
        if (e?.code === '23505') {
          // unique violation — already seeded, skip
          continue;
        }
        throw e;
      }
    }
  }
}

export default seedRbac;
