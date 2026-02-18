/**
 * @file Seeds RBAC system roles, policies, and Layer 2-3 defaults per module
 * @module core/seeds/seed_rbac
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import db from '../../../db/db.js';
import { seedPolicyCatalog } from './seed_policy_catalog.js';

/**
 * Safely insert a record, silently skipping unique constraint violations.
 */
async function safeInsert(modelName, schema, data) {
  try {
    return await db(modelName, schema).insert(data);
  } catch (e) {
    if (e?.code === '23505') return null; // unique violation — already seeded
    throw e;
  }
}

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

  const roleCodesToCheck = isAdminSchema
    ? ['super_user', 'admin']
    : ['admin', 'project_manager', 'controller'];
  const existing = await db('roles', schema).findWhere([{ code: { $in: roleCodesToCheck } }], 'AND');
  const haveCodes = new Set(existing.map((r) => r.code));

  // ── System roles ──────────────────────────────────────────────────────
  if (isAdminSchema && !haveCodes.has('super_user')) {
    await db('roles', schema).insert({
      code: 'super_user',
      name: 'Super User',
      is_system: true,
      is_immutable: true,
      scope: 'all_projects',
      created_by: createdBy,
    });
  }

  if (!haveCodes.has('admin')) {
    await db('roles', schema).insert({
      code: 'admin',
      name: 'Administrator',
      is_system: true,
      is_immutable: true,
      scope: 'all_projects',
      created_by: createdBy,
    });
  }

  // ── Tenant-specific roles, policies, and state filters ────────────────
  if (!isAdminSchema) {
    // ── Project Manager ───────────────────────────────────────────────
    let pm;
    if (!haveCodes.has('project_manager')) {
      pm = await db('roles', schema).insert({
        code: 'project_manager',
        name: 'Project Manager',
        scope: 'assigned_projects',
        created_by: createdBy,
      });
    } else {
      pm = await db('roles', schema).findOneBy([{ code: 'project_manager' }]);
    }

    // Layer 1: Policies per PRD §3.7 RBAC hierarchy
    const pmPolicies = [
      { role_id: pm.id, module: 'projects', router: null, action: null, level: 'full' },
      { role_id: pm.id, module: 'accounting', router: null, action: null, level: 'view' },
      { role_id: pm.id, module: 'ar', router: null, action: null, level: 'view' },
      { role_id: pm.id, module: 'ar', router: 'ar-invoices', action: 'approve', level: 'none' },
    ];

    for (const p of pmPolicies) {
      await safeInsert('policies', schema, { ...p, created_by: createdBy });
    }

    // Layer 3: State filters — PM can only see approved/sent invoices
    await safeInsert('stateFilters', schema, {
      role_id: pm.id,
      module: 'ar',
      router: 'ar-invoices',
      visible_statuses: ['approved', 'sent'],
      created_by: createdBy,
    });

    // ── Controller ────────────────────────────────────────────────────
    let ctrl;
    if (!haveCodes.has('controller')) {
      ctrl = await db('roles', schema).insert({
        code: 'controller',
        name: 'Controller',
        description: 'Financial controller with full accounting access, scoped to assigned companies',
        scope: 'assigned_companies',
        created_by: createdBy,
      });
    } else {
      ctrl = await db('roles', schema).findOneBy([{ code: 'controller' }]);
    }

    const ctrlPolicies = [
      { role_id: ctrl.id, module: 'accounting', router: null, action: null, level: 'full' },
      { role_id: ctrl.id, module: 'ar', router: null, action: null, level: 'full' },
      { role_id: ctrl.id, module: 'ap', router: null, action: null, level: 'full' },
      { role_id: ctrl.id, module: 'projects', router: null, action: null, level: 'view' },
      { role_id: ctrl.id, module: 'reports', router: null, action: null, level: 'view' },
    ];

    for (const p of ctrlPolicies) {
      await safeInsert('policies', schema, { ...p, created_by: createdBy });
    }

    // ── Admin role policies for tenants module ────────────────────────
    // Only effective for NapSoft users (requireNapsoftTenant gates the router).
    const adminRole = await db('roles', schema).findOneBy([{ code: 'admin' }]);
    if (adminRole) {
      const adminPolicies = [
        { role_id: adminRole.id, module: 'tenants', router: 'tenants', action: null, level: 'full' },
        { role_id: adminRole.id, module: 'tenants', router: 'nap-users', action: null, level: 'full' },
      ];
      for (const p of adminPolicies) {
        await safeInsert('policies', schema, { ...p, created_by: createdBy });
      }
    }

    // ── Auto-assign admin role to the creating user ──────────────────
    if (createdBy && typeof createdBy === 'string' && /^[0-9a-f-]{36}$/i.test(createdBy)) {
      if (adminRole) {
        await safeInsert('roleMembers', schema, {
          role_id: adminRole.id,
          user_id: createdBy,
          is_primary: true,
          created_by: createdBy,
        });
      }
    }

    // ── Policy catalog ────────────────────────────────────────────────
    await seedPolicyCatalog({ schemaName });
  }
}

export default seedRbac;
