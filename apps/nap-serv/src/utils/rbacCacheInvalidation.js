/**
 * @file RBAC cache invalidation helpers
 * @module nap-serv/utils/rbacCacheInvalidation
 *
 * Clears cached permission canons from Redis when RBAC data changes.
 * Must be called when project_members, state_filters, field_group_grants,
 * or role scope values are mutated.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { getRedis } from './redis.js';
import db from '../db/db.js';
import logger from './logger.js';

/**
 * Invalidate cached permissions for a single user in a tenant.
 * @param {string} userId User UUID
 * @param {string} tenantCode Tenant code or schema name
 */
export async function invalidateUserPermissions(userId, tenantCode) {
  if (!userId || !tenantCode) return;
  try {
    const redis = await getRedis();
    await redis.del(`perm:${userId}:${tenantCode}`);
  } catch (err) {
    logger.warn('Failed to invalidate user permissions cache', { userId, tenantCode, error: err?.message });
  }
}

/**
 * Invalidate cached permissions for all users holding a given role.
 * Use when role-level RBAC data changes (state_filters, field_group_grants, scope).
 * @param {string} roleId Role UUID
 * @param {string} schemaName Tenant schema name
 */
export async function invalidateRolePermissions(roleId, schemaName) {
  if (!roleId || !schemaName) return;
  try {
    const members = await db('roleMembers', schemaName).findWhere(
      [{ role_id: roleId }],
      'AND',
      { columnWhitelist: ['user_id'] },
    );
    for (const m of members) {
      await invalidateUserPermissions(m.user_id, schemaName);
    }
  } catch (err) {
    logger.warn('Failed to invalidate role permissions cache', { roleId, schemaName, error: err?.message });
  }
}

export default { invalidateUserPermissions, invalidateRolePermissions };
