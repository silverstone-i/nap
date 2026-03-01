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
      const dbMod = await import('../db/db.js');
      const db = dbMod.default || dbMod.db;
      let userRecord = null;
      let tenantRecord = null;
      try {
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

      // ── Schema resolution ───────────────────────────────────────────────
      // Permissions always load from the user's home tenant (where their roles live).
      // Data queries use the assumed tenant's schema when the header is present.
      // effectiveTenantRecord tracks the tenant whose data the request operates on.
      const homeSchemaName = tenantRecord.schema_name;
      let dataSchemaName = homeSchemaName;
      let effectiveTenantRecord = tenantRecord;
      if (headerTenant && tenantCode !== homeTenantCode) {
        try {
          const row = await db.oneOrNone(
            'SELECT * FROM admin.tenants WHERE LOWER(tenant_code) = $1 AND deactivated_at IS NULL',
            [tenantCode],
          );
          if (row) {
            dataSchemaName = row.schema_name;
            effectiveTenantRecord = row;
          }
        } catch {
          // Fall back to home schema if lookup fails
        }
      }

      // ── RBAC Permission Loading ─────────────────────────────────────────
      const schemaName = homeSchemaName;
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

      // ── Impersonation Detection ────────────────────────────────────────
      let isImpersonating = false;
      let impersonatedBy = null;
      let effectiveUser = userRecord;
      let effectiveTenantCode = tenantCode;
      let effectiveSchemaName = dataSchemaName;
      let effectivePermissions = permissions;

      try {
        const redis = await getRedis();
        const impData = await redis.get(`imp:${uid}`);
        if (impData) {
          const parsed = JSON.parse(impData);
          isImpersonating = true;
          impersonatedBy = uid;

          // Load target user data
          const dbMod2 = await import('../db/db.js');
          const db2 = dbMod2.default || dbMod2.db;
          const targetUser = await db2('napUsers', 'admin').findOneBy([{ id: parsed.targetUserId }]);
          if (targetUser) {
            effectiveUser = targetUser;
            effectiveTenantCode = parsed.targetTenantCode || tenantCode;
            effectiveSchemaName = parsed.targetSchemaName || schemaName;

            // Resolve the impersonated user's tenant record
            if (targetUser.tenant_id !== tenantRecord.id) {
              const targetTenant = await db2('tenants', 'admin').findById(targetUser.tenant_id);
              if (targetTenant) effectiveTenantRecord = targetTenant;
            }

            // Re-load permissions for target user
            effectivePermissions = await loadPermissions({
              schemaName: effectiveSchemaName,
              userId: targetUser.id,
              entityType: targetUser.entity_type,
              entityId: targetUser.entity_id,
            });
          }
        }
      } catch {
        // Redis unavailable — proceed without impersonation
      }

      // ── Populate req.user ───────────────────────────────────────────────
      req.user = {
        id: isImpersonating ? impersonatedBy : uid,
        email: effectiveUser.email,
        entity_type: effectiveUser.entity_type,
        entity_id: effectiveUser.entity_id,
        status: effectiveUser.status,
        tenant_id: effectiveUser.tenant_id,
        tenant_code: effectiveTenantCode,
        home_tenant: homeTenantCode,
        schema_name: effectiveSchemaName,
        permissions: effectivePermissions,
        is_impersonating: isImpersonating,
        impersonated_by: impersonatedBy,
      };

      req.ctx = {
        user_id: isImpersonating ? impersonatedBy : uid,
        tenant_code: effectiveTenantCode,
        schema: effectiveSchemaName,
        tenant: effectiveTenantRecord,
        perms: effectivePermissions,
      };

      return next();
    } catch (error) {
      logger.warn('authRedis rejected request', { error: error?.message });
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

export default authRedis;
