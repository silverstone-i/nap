/**
 * @file System role seeder — seeds RBAC roles and policies for a tenant schema
 * @module core/services/systemRoleSeeder
 *
 * Three system roles:
 * - super_user (NapSoft only): full access all modules, cross-tenant, impersonation
 * - admin (all tenants): full access all modules
 * - support (NapSoft only): full non-financial, cross-tenant, impersonation
 *
 * All system roles go through full RBAC resolution — no bypass.
 * Called during tenant provisioning (Phase 4).
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import logger from '../../../lib/logger.js';

/** Modules where support role gets 'none' instead of 'full'. */
const FINANCIAL_MODULES = ['accounting', 'ap', 'ar'];

/**
 * System role definitions.
 * @param {boolean} isNapsoft Whether this is the NapSoft platform tenant
 * @returns {Array<object>} Role definitions with their policies
 */
function getSystemRoleDefinitions(isNapsoft) {
  const roles = [];

  // admin — seeded in all tenants
  roles.push({
    code: 'admin',
    name: 'Administrator',
    description: 'Full access to all modules within this tenant',
    is_system: true,
    is_immutable: true,
    scope: 'all_projects',
    policies: [{ module: '', router: null, action: null, level: 'full' }],
  });

  if (isNapsoft) {
    // super_user — NapSoft only
    roles.push({
      code: 'super_user',
      name: 'Super User',
      description: 'Full platform access including cross-tenant management and impersonation',
      is_system: true,
      is_immutable: true,
      scope: 'all_projects',
      policies: [{ module: '', router: null, action: null, level: 'full' }],
    });

    // support — NapSoft only
    roles.push({
      code: 'support',
      name: 'Support',
      description: 'Full non-financial access with cross-tenant support and impersonation',
      is_system: true,
      is_immutable: true,
      scope: 'all_projects',
      policies: [
        { module: '', router: null, action: null, level: 'full' },
        // Override financial modules to none
        ...FINANCIAL_MODULES.map((mod) => ({ module: mod, router: null, action: null, level: 'none' })),
      ],
    });
  }

  return roles;
}

/**
 * Seed system roles and their policies into a tenant schema.
 *
 * @param {object} dbInstance pg-promise database connection or transaction
 * @param {object} pgp pg-promise helpers
 * @param {string} schemaName Tenant schema name
 * @param {string} tenantCode Tenant code (e.g., 'nap', 'acme')
 * @param {boolean} isNapsoft Whether this is the NapSoft platform tenant
 */
export async function seedSystemRoles(dbInstance, pgp, schemaName, tenantCode, isNapsoft) {
  const s = pgp.as.name(schemaName);
  const definitions = getSystemRoleDefinitions(isNapsoft);

  for (const roleDef of definitions) {
    // Check if role already exists (idempotent)
    const existing = await dbInstance.oneOrNone(
      `SELECT id FROM ${s}.roles WHERE code = $1`,
      [roleDef.code],
    );

    let roleId;
    if (existing) {
      roleId = existing.id;
      logger.info(`System role '${roleDef.code}' already exists in ${schemaName}, skipping insert`);
    } else {
      const inserted = await dbInstance.one(
        `INSERT INTO ${s}.roles (tenant_code, code, name, description, is_system, is_immutable, scope)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [tenantCode, roleDef.code, roleDef.name, roleDef.description, roleDef.is_system, roleDef.is_immutable, roleDef.scope],
      );
      roleId = inserted.id;
      logger.info(`Seeded system role '${roleDef.code}' in ${schemaName}`);
    }

    // Seed policies for this role
    for (const policy of roleDef.policies) {
      const policyExists = await dbInstance.oneOrNone(
        `SELECT id FROM ${s}.policies
         WHERE role_id = $1 AND module = $2 AND router IS NOT DISTINCT FROM $3 AND action IS NOT DISTINCT FROM $4`,
        [roleId, policy.module, policy.router, policy.action],
      );

      if (!policyExists) {
        await dbInstance.none(
          `INSERT INTO ${s}.policies (tenant_code, role_id, module, router, action, level)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [tenantCode, roleId, policy.module, policy.router, policy.action, policy.level],
        );
      }
    }
  }
}

export default { seedSystemRoles };
