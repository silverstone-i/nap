'use strict';

import db from '../db/db.js';

/**
 * Load flattened policies for a user in a tenant.
 * Returns map of "module::router::action" => level
 * router or action can be empty string for broader scopes.
 */
export async function loadPoliciesForUserTenant({ tenantId, userId }) {
  // Find all roles for this user in this tenant (tenant roles only)
  const tenantRoles = await db('roleMembers', 'public').findWhere([{ tenant_id: tenantId }, { user_id: userId }], 'AND', {
    columnWhitelist: ['role_id'],
  });

  if (!tenantRoles?.length) return {};

  const roleIds = tenantRoles.map((r) => r.role_id);

  const policies = await db('policies', 'public').findWhere([{ role_id: { $in: roleIds } }], 'AND', {
    columnWhitelist: ['module', 'router', 'action', 'level'],
  });

  const map = {};
  for (const p of policies) {
    const key = `${p.module ?? ''}::${p.router ?? ''}::${p.action ?? ''}`;
    map[key] = p.level;
  }
  return map;
}

export default { loadPoliciesForUserTenant };
