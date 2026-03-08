/**
 * @file Permission cache invalidator — flushes Redis permission cache after RBAC mutations
 * @module nap-serv/services/permCacheInvalidator
 *
 * Fire-and-forget semantics: errors are logged but never thrown.
 * If Redis is unavailable the 15-minute TTL handles eventual consistency.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import db, { pgp } from '../db/db.js';
import { getRedis } from '../db/redis.js';
import logger from '../lib/logger.js';

/** Entity tables that carry a roles text[] column. */
const ENTITY_TABLES = ['employees', 'vendors', 'clients', 'contacts'];

/** Map table name → entity_type value used in admin.nap_users. */
const TABLE_TO_ENTITY_TYPE = {
  employees: 'employee',
  vendors: 'vendor',
  clients: 'client',
  contacts: 'contact',
};

/**
 * Flush permission cache for every user assigned a given role.
 *
 * @param {string} schema   Tenant schema name (e.g. 'srh')
 * @param {string} roleCode Role code (e.g. 'bookkeeper')
 * @param {string} tenantCode Lowercase tenant code for the cache key
 */
export async function invalidateByRole(schema, roleCode, tenantCode) {
  try {
    const s = pgp.as.name(schema);
    const redis = await getRedis();

    // Collect nap_user IDs across all entity tables that carry this role
    const userIds = [];

    for (const table of ENTITY_TABLES) {
      const entityType = TABLE_TO_ENTITY_TYPE[table];
      const entities = await db.any(
        `SELECT e.id FROM ${s}.${pgp.as.name(table)} e
         WHERE e.roles @> ARRAY[$1]::text[] AND e.deactivated_at IS NULL`,
        [roleCode],
      );

      if (!entities.length) continue;

      const entityIds = entities.map((e) => e.id);
      const users = await db.any(
        `SELECT id FROM admin.nap_users
         WHERE entity_type = $1 AND entity_id IN ($2:csv) AND deactivated_at IS NULL`,
        [entityType, entityIds],
      );

      for (const u of users) userIds.push(u.id);
    }

    if (!userIds.length) return;

    const keys = userIds.map((id) => `perm:${id}:${tenantCode}`);
    const deleted = await redis.del(...keys);

    logger.info(`permCacheInvalidator: flushed ${deleted} key(s) for role "${roleCode}" in ${tenantCode}`);
  } catch (err) {
    logger.warn('permCacheInvalidator: invalidateByRole failed', { error: err?.message });
  }
}

/**
 * Flush permission cache for a single entity's linked nap_user.
 *
 * @param {string} entityType e.g. 'employee'
 * @param {string} entityId   UUID of the entity record
 * @param {string} tenantCode Lowercase tenant code for the cache key
 */
export async function invalidateByEntity(entityType, entityId, tenantCode) {
  try {
    const redis = await getRedis();

    const user = await db.oneOrNone(
      `SELECT id FROM admin.nap_users
       WHERE entity_type = $1 AND entity_id = $2 AND deactivated_at IS NULL`,
      [entityType, entityId],
    );

    if (!user) return;

    const key = `perm:${user.id}:${tenantCode}`;
    await redis.del(key);

    logger.info(`permCacheInvalidator: flushed cache for ${entityType} ${entityId} in ${tenantCode}`);
  } catch (err) {
    logger.warn('permCacheInvalidator: invalidateByEntity failed', { error: err?.message });
  }
}

/**
 * Flush all permission cache keys for a specific user (across all tenants).
 * Used on logout to ensure a clean slate on next login.
 *
 * @param {string} userId UUID of the nap_user
 */
export async function invalidateByUser(userId) {
  try {
    const redis = await getRedis();

    // SCAN for all perm keys belonging to this user
    let cursor = '0';
    const keysToDelete = [];
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `perm:${userId}:*`, 'COUNT', 100);
      cursor = nextCursor;
      keysToDelete.push(...keys);
    } while (cursor !== '0');

    if (keysToDelete.length) {
      await redis.del(...keysToDelete);
      logger.info(`permCacheInvalidator: flushed ${keysToDelete.length} key(s) on logout for user ${userId}`);
    }
  } catch (err) {
    logger.warn('permCacheInvalidator: invalidateByUser failed', { error: err?.message });
  }
}

export default { invalidateByRole, invalidateByEntity, invalidateByUser };
