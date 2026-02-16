/**
 * @file RBAC policy loader — resolves effective permissions for a user in a tenant schema
 * @module nap-serv/utils/RbacPolicies
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import db from '../db/db.js';

const LEVEL_ORDER = { none: 0, view: 1, full: 2 };
const LEVEL_NAMES = ['none', 'view', 'full'];

/**
 * Load flattened policies for a user in a tenant.
 * Queries role_members and policies tables in the tenant schema.
 * Returns a map of "module::router::action" => level (highest wins across roles).
 *
 * @param {object} options
 * @param {string} options.schemaName Tenant schema name
 * @param {string} options.userId User UUID
 * @returns {Promise<object>} Capabilities map
 */
export async function loadPoliciesForUserTenant({ schemaName, userId }) {
  if (!schemaName || !userId) return {};

  const tenantRoles = await db('roleMembers', schemaName).findWhere(
    [{ user_id: userId }],
    'AND',
    { columnWhitelist: ['role_id'] },
  );

  if (!tenantRoles?.length) return {};

  const roleIds = tenantRoles.map((r) => r.role_id);

  const policies = await db('policies', schemaName).findWhere(
    [{ role_id: { $in: roleIds } }],
    'AND',
    { columnWhitelist: ['module', 'router', 'action', 'level'] },
  );

  // Combine by taking the maximum level across roles
  const map = {};
  for (const p of policies) {
    const key = `${p.module ?? ''}::${p.router ?? ''}::${p.action ?? ''}`;
    const current = map[key];
    if (!current) {
      map[key] = p.level;
      continue;
    }
    const have = LEVEL_ORDER[current] ?? 0;
    const next = LEVEL_ORDER[p.level] ?? 0;
    map[key] = LEVEL_NAMES[Math.max(have, next)];
  }
  return map;
}

export default { loadPoliciesForUserTenant };
