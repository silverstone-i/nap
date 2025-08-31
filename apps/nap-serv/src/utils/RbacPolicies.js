'use strict';

import db from '../db/db.js';

/**
 * Load flattened policies for a user in a tenant.
 * Returns map of "module::router::action" => level
 * router or action can be empty string for broader scopes.
 */
export async function loadPoliciesForUserTenant({ schemaName, userId }) {
  if (!schemaName || !userId) return {};
  // Find all roles for this user in this tenant schema (tenant roles only)
  const tenantRoles = await db('roleMembers', schemaName).findWhere([{ user_id: userId }], 'AND', {
    columnWhitelist: ['role_id'],
  });

  if (!tenantRoles?.length) return {};

  const roleIds = tenantRoles.map((r) => r.role_id);

  const policies = await db('policies', schemaName).findWhere([{ role_id: { $in: roleIds } }], 'AND', {
    columnWhitelist: ['module', 'router', 'action', 'level'],
  });

  // Combine by taking the maximum level across roles: none < view < full
  const order = { none: 0, view: 1, full: 2 };
  const invert = ['none', 'view', 'full'];
  const map = {};
  for (const p of policies) {
    const key = `${p.module ?? ''}::${p.router ?? ''}::${p.action ?? ''}`;
    const current = map[key];
    if (!current) {
      map[key] = p.level;
      continue;
    }
    const have = order[current] ?? 0;
    const next = order[p.level] ?? 0;
    map[key] = invert[Math.max(have, next)];
  }
  return map;
}

export default { loadPoliciesForUserTenant };
