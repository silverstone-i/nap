'use strict';

import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import { getRedis } from '../utils/redis.js';
import { calcPermHash } from '../utils/permHash.js';

const AUTH_BYPASS_SEGMENTS = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/check'];

async function buildCanon({ schemaName, userId }) {
  const { loadPoliciesForUserTenant } = await import('../utils/RbacPolicies.js');
  const caps = await loadPoliciesForUserTenant({ schemaName, userId });
  return { caps };
}

function shouldBypassAuth(path, fullPath) {
  const normalizedPath = (path || '').toLowerCase();
  const normalizedFullPath = (fullPath || '').toLowerCase();
  if (normalizedPath === '/') return true;

  return AUTH_BYPASS_SEGMENTS.some(
    segment => normalizedPath.includes(segment) || normalizedFullPath.includes(segment),
  );
}

function resolveTenantContext({ headers, claims, fullPath }) {
  const lowerFullPath = (fullPath || '').toLowerCase();
  const headerTenant = headers['x-tenant-code'] || headers['x-tenant'];
  const claimTenant = claims?.tenant_code || claims?.tenantId;
  const tenantCode = (headerTenant || claimTenant || '').toLowerCase();
  let schemaName = claims?.schema_name?.toLowerCase?.() || tenantCode || null;

  const isAdminArea =
    lowerFullPath.includes('/api/tenants/v1/admin') ||
    lowerFullPath.includes('/api/core/v1/admin');
  const isCoreAuthSelf =
    lowerFullPath.includes('/api/core/v1/auth/me') ||
    lowerFullPath.includes('/api/auth/me');

  if (!schemaName && isAdminArea) {
    schemaName = 'admin';
  }

  return { tenantCode, schemaName, isAdminArea, isCoreAuthSelf };
}

async function loadPermissions({ userId, schemaName, tenantCode, bypassRbac }) {
  if (bypassRbac) {
    return { hash: null, version: 1, updatedAt: Date.now(), perms: { caps: {} } };
  }

  const redis = await getRedis();
  const permKey = `perm:${userId}:${tenantCode || schemaName}`;
  let record = await redis.get(permKey).then(value => (value ? JSON.parse(value) : null));

  if (!record) {
    const canon = await buildCanon({ schemaName, userId });
    const hash = calcPermHash(canon);
    record = { hash, version: 1, updatedAt: Date.now(), perms: canon };
    await redis.set(permKey, JSON.stringify(record));
  }

  return record;
}

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

      const claims = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      let uid = claims?.sub || claims?.id;
      const tokenHash = claims?.ph || null;

      if (!uid && claims?.email) {
        uid = 'test-user-id';
      }

      const { tenantCode, schemaName, isAdminArea, isCoreAuthSelf } = resolveTenantContext({
        headers: req.headers,
        claims,
        fullPath,
      });

      if (!uid || (!schemaName && !isCoreAuthSelf)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const permsRecord = await loadPermissions({
        userId: uid,
        schemaName,
        tenantCode,
        bypassRbac: isAdminArea || isCoreAuthSelf,
      });

      req.user = {
        id: uid,
        email: claims?.email,
        user_name: claims?.user_name,
        role: claims?.role,
        tenant_code: tenantCode || null,
        schema_name: schemaName,
        perms: permsRecord.perms,
      };

      req.ctx = {
        ...(req.ctx || {}),
        user_id: uid,
        tenant_code: tenantCode || null,
        schema: schemaName || null,
        perms: permsRecord.perms,
      };

      if (tokenHash && permsRecord?.hash && tokenHash !== permsRecord.hash) {
        res.setHeader('X-Token-Stale', '1');
      }

      return next();
    } catch (error) {
      logger.warn('authRedis rejected request', { error: error?.message });
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

export default authRedis;
