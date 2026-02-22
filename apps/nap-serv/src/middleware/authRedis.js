/**
 * @file Auth middleware — JWT verification, tenant resolution, permission stub
 * @module nap-serv/middleware/authRedis
 *
 * Phase 2: Verifies JWT from httpOnly cookie, resolves tenant context,
 * populates req.user. RBAC permission loading is stubbed (added in Phase 3).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import jwt from 'jsonwebtoken';
import logger from '../lib/logger.js';

const AUTH_BYPASS_SEGMENTS = ['/auth/login', '/auth/refresh', '/auth/logout'];

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
 * Express middleware factory — returns the auth middleware function.
 *
 * Phase 2 simplified flow:
 * 1. Bypass auth for login/refresh/logout paths
 * 2. Verify JWT from httpOnly cookie
 * 3. Look up user + tenant from database
 * 4. Populate req.user
 *
 * Phase 3 will add: RBAC permission loading, Redis caching, stale token detection,
 * cross-tenant access, impersonation override.
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
      const tenantCode = headerTenant ? headerTenant.toLowerCase() : tenantRecord.tenant_code.toLowerCase();

      req.user = {
        id: uid,
        email: userRecord.email,
        entity_type: userRecord.entity_type,
        entity_id: userRecord.entity_id,
        status: userRecord.status,
        tenant_id: userRecord.tenant_id,
        tenant_code: tenantCode,
        schema_name: tenantRecord.schema_name,
        // Phase 3 will add: perms, home_tenant, rbac_schema, is_cross_tenant
      };

      req.ctx = {
        user_id: uid,
        tenant_code: tenantCode,
        schema: tenantRecord.schema_name,
        tenant: tenantRecord,
      };

      return next();
    } catch (error) {
      logger.warn('authRedis rejected request', { error: error?.message });
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

export default authRedis;
