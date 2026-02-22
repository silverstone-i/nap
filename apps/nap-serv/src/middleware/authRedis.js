/**
 * @file Auth middleware — JWT verification, tenant resolution, RBAC permission loading
 * @module nap-serv/middleware/authRedis
 *
 * Verifies JWT from httpOnly cookie, resolves tenant context, loads RBAC
 * permissions (from Redis cache or DB), detects stale tokens, and populates
 * req.user with the full permission canon.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import jwt from 'jsonwebtoken';
import logger from '../lib/logger.js';
import { loadPermissions } from '../services/permissionLoader.js';
import { calcPermHash } from '../lib/permHash.js';
import { getRedis } from '../db/redis.js';

const AUTH_BYPASS_SEGMENTS = ['/auth/login', '/auth/refresh', '/auth/logout'];
const PERM_CACHE_TTL = 900; // 15 minutes

/**
 * Check if the request path should bypass authentication.
 */
function shouldBypassAuth(path, fullPath) {
  const normalizedPath = (path || '').toLowerCase();
  const normalizedFullPath = (fullPath || '').toLowerCase();
  if (normalizedPath === '/') return true;

  return AUTH_BYPASS_SEGMENTS.some(
    (segment) => normalizedPath.includes(segment) || normalizedFullPath.includes(segment),
  );
}

/**
 * Try to read cached permissions from Redis.
 * @returns {object|null} Cached permission canon, or null on miss/error
 */
async function getCachedPermissions(userId, tenantCode) {
  try {
    const redis = await getRedis();
    const cached = await redis.get(`perm:${userId}:${tenantCode}`);
    if (cached) return JSON.parse(cached);
  } catch {
    // Redis unavailable — fall through to DB
  }
  return null;
}

/**
 * Cache permissions in Redis.
 */
async function cachePermissions(userId, tenantCode, canon) {
  try {
    const redis = await getRedis();
    await redis.set(`perm:${userId}:${tenantCode}`, JSON.stringify(canon), 'EX', PERM_CACHE_TTL);
  } catch {
    // Redis unavailable — non-fatal
  }
}

/**
 * Express middleware factory — returns the auth middleware function.
 *
 * Flow:
 * 1. Bypass auth for login/refresh/logout paths
 * 2. Verify JWT from httpOnly cookie
 * 3. Look up user + tenant from database
 * 4. Load RBAC permissions (Redis cache → DB fallback)
 * 5. Detect stale tokens (ph claim vs computed hash)
 * 6. Populate req.user with full permission canon
 */
export function authRedis() {
  return async (req, res, next) => {
    try {
      const path = req.path || '';
      const fullPath = req.originalUrl || req.url || '';

      if (shouldBypassAuth(path, fullPath)) {
        return next();
      }

      const token = req.cookies?.auth_token;
      if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      let claims;
      try {
        claims = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      } catch {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const uid = claims?.sub;
      if (!uid) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Hydrate user from DB (JWT is minimal: sub + ph only)
      let userRecord = null;
      let tenantRecord = null;
      try {
        const dbMod = await import('../db/db.js');
        const db = dbMod.default || dbMod.db;
        userRecord = await db('napUsers', 'admin').findOneBy([{ id: uid }]);
        if (userRecord) {
          tenantRecord = await db('tenants', 'admin').findById(userRecord.tenant_id);
        }
      } catch {
        // DB unavailable — reject
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!userRecord || !tenantRecord) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Resolve tenant code from header or user's tenant
      const headerTenant = req.headers['x-tenant-code'];
      const homeTenantCode = tenantRecord.tenant_code.toLowerCase();
      const tenantCode = headerTenant ? headerTenant.toLowerCase() : homeTenantCode;

      // ── RBAC Permission Loading ─────────────────────────────────────────
      const schemaName = tenantRecord.schema_name;
      let permissions = await getCachedPermissions(uid, tenantCode);

      if (!permissions) {
        permissions = await loadPermissions({
          schemaName,
          userId: uid,
          entityType: userRecord.entity_type,
          entityId: userRecord.entity_id,
        });
        await cachePermissions(uid, tenantCode, permissions);
      }

      // ── Stale Token Detection ───────────────────────────────────────────
      const permHash = calcPermHash(permissions);
      if (claims.ph && claims.ph !== permHash) {
        res.setHeader('X-Token-Stale', '1');
      }

      // ── Populate req.user ───────────────────────────────────────────────
      req.user = {
        id: uid,
        email: userRecord.email,
        entity_type: userRecord.entity_type,
        entity_id: userRecord.entity_id,
        status: userRecord.status,
        tenant_id: userRecord.tenant_id,
        tenant_code: tenantCode,
        home_tenant: homeTenantCode,
        schema_name: schemaName,
        permissions,
      };

      req.ctx = {
        user_id: uid,
        tenant_code: tenantCode,
        schema: schemaName,
        tenant: tenantRecord,
        perms: permissions,
      };

      return next();
    } catch (error) {
      logger.warn('authRedis rejected request', { error: error?.message });
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

export default authRedis;
