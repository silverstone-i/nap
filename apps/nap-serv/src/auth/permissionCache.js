/**
 * @file Redis permission caching — stores/retrieves RBAC permissions per PRD §3.1.2
 * @module nap-serv/auth/permissionCache
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { getRedis } from '../utils/redis.js';
import { calcPermHash } from '../utils/permHash.js';

/**
 * Build the Redis key for a user's permissions in a tenant.
 * @param {string} userId User UUID
 * @param {string} tenantCode Tenant code (lowercased)
 * @returns {string} Redis key
 */
function permKey(userId, tenantCode) {
  return `perm:${userId}:${tenantCode}`;
}

/**
 * Cache a user's permissions in Redis.
 * @param {string} userId User UUID
 * @param {string} tenantCode Tenant code
 * @param {object} canon Permissions object (e.g., { caps: { ... } })
 * @param {object} [userMeta] Minimal user metadata for the cache entry
 */
export async function cachePermissions(userId, tenantCode, canon, userMeta = {}) {
  const redis = await getRedis();
  const hash = calcPermHash(canon);
  const record = {
    hash,
    version: 1,
    updatedAt: Date.now(),
    perms: canon,
    user: userMeta,
  };
  await redis.set(permKey(userId, tenantCode), JSON.stringify(record));
  return { hash, record };
}

/**
 * Retrieve cached permissions from Redis.
 * @param {string} userId User UUID
 * @param {string} tenantCode Tenant code
 * @returns {Promise<object|null>} Cached record or null
 */
export async function getPermissions(userId, tenantCode) {
  const redis = await getRedis();
  const value = await redis.get(permKey(userId, tenantCode));
  return value ? JSON.parse(value) : null;
}

/**
 * Invalidate cached permissions for a user in a tenant.
 * @param {string} userId User UUID
 * @param {string} tenantCode Tenant code
 */
export async function clearPermissions(userId, tenantCode) {
  const redis = await getRedis();
  await redis.del(permKey(userId, tenantCode));
}

/**
 * Compute the SHA-256 permission hash for a canon object.
 * Re-export for convenience.
 */
export { calcPermHash as computePermissionHash };

export default { cachePermissions, getPermissions, clearPermissions, computePermissionHash: calcPermHash };
