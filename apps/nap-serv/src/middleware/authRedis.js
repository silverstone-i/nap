/**
 * @file Auth middleware — JWT verification, tenant resolution, Redis permission loading
 * @module nap-serv/middleware/authRedis
 *
 * Extracts auth_token from httpOnly cookie, verifies JWT, resolves tenant context,
 * loads permissions from Redis (or builds fresh from DB), and populates req.user/req.ctx.
 * Sets X-Token-Stale: 1 header if the JWT's ph claim diverges from cached hash.
 *
 * Supports cross-tenant access (NapSoft users only) via x-tenant-code header,
 * and user impersonation via Redis imp:{userId} keys.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import { getRedis } from '../utils/redis.js';
import { calcPermHash } from '../utils/permHash.js';

const AUTH_BYPASS_SEGMENTS = ['/auth/login', '/auth/refresh', '/auth/logout'];
const NAPSOFT_TENANT = (process.env.NAPSOFT_TENANT || 'NAP').toLowerCase();

/**
 * Build permission canon from database for a user in a tenant schema.
 */
async function buildCanon({ schemaName, userId }) {
  const { loadPoliciesForUserTenant } = await import('../utils/RbacPolicies.js');
  const canon = await loadPoliciesForUserTenant({ schemaName, userId });
  // canon = { caps, scope, projectIds, stateFilters, fieldGroups }
  return canon;
}

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
 * Resolve tenant context from headers and JWT claims.
 *
 * Cross-tenant access: when the x-tenant-code header differs from the JWT's
 * tenant_code, only NapSoft users are allowed to switch. Non-NapSoft users
 * silently fall back to their home tenant.
 */
function resolveTenantContext({ headers, claims, fullPath }) {
  const lowerFullPath = (fullPath || '').toLowerCase();
  const claimTenant = claims?.tenant_code || claims?.tenantId;
  const homeTenant = (claimTenant || '').toLowerCase();
  const headerTenant = headers['x-tenant-code'] || headers['x-tenant'];

  // Determine effective tenant code with cross-tenant validation
  let tenantCode;
  let isCrossTenant = false;

  if (headerTenant) {
    const requestedTenant = headerTenant.toLowerCase();
    if (!homeTenant) {
      // Minimal JWT (no tenant_code claim) — trust the header as the user's own tenant
      tenantCode = requestedTenant;
    } else if (requestedTenant !== homeTenant) {
      // Cross-tenant: only NapSoft users may switch
      if (homeTenant === NAPSOFT_TENANT) {
        tenantCode = requestedTenant;
        isCrossTenant = true;
      } else {
        tenantCode = homeTenant; // silently ignore header
      }
    } else {
      tenantCode = requestedTenant;
    }
  } else {
    tenantCode = homeTenant;
  }

  let schemaName = claims?.schema_name?.toLowerCase?.() || tenantCode || null;

  // For cross-tenant, override schema to the assumed tenant's schema
  if (isCrossTenant) {
    schemaName = tenantCode;
  }

  const isAdminArea =
    lowerFullPath.includes('/api/tenants/v1/') ||
    lowerFullPath.includes('/api/core/v1/admin');
  const isCoreAuthSelf =
    lowerFullPath.includes('/api/core/v1/auth/me') ||
    lowerFullPath.includes('/api/auth/me') ||
    lowerFullPath.includes('/api/auth/check') ||
    lowerFullPath.includes('/api/auth/change-password');

  if (!schemaName && isAdminArea) {
    schemaName = 'admin';
  }

  // User's home tenant schema for RBAC policy resolution
  const homeTenantSchema = homeTenant || null;

  return { tenantCode, schemaName, isAdminArea, isCoreAuthSelf, homeTenantSchema, isCrossTenant };
}

/**
 * Load permissions from Redis cache or build fresh from DB.
 */
async function loadPermissions({ userId, schemaName, tenantCode, bypassRbac }) {
  const empty = {
    hash: null,
    version: 1,
    updatedAt: Date.now(),
    perms: { caps: {}, scope: 'all_projects', projectIds: null, companyIds: null, stateFilters: {}, fieldGroups: {} },
  };

  const redis = await getRedis();
  const key = `perm:${userId}:${tenantCode || schemaName}`;
  let record = await redis.get(key).then((value) => (value ? JSON.parse(value) : null));

  // Return cached record if available (even for bypassRbac endpoints like /me)
  if (record) return record;

  // If bypassing RBAC (e.g. /me or /check) and no cache exists yet, return empty
  // gracefully — don't attempt a DB rebuild that may fail without a schema context.
  if (bypassRbac) return empty;

  try {
    const canon = await buildCanon({ schemaName, userId });
    const hash = calcPermHash(canon);
    record = { hash, version: 1, updatedAt: Date.now(), perms: canon };
    await redis.set(key, JSON.stringify(record));
    return record;
  } catch {
    return empty;
  }
}

/**
 * Check if this path is exempt from impersonation override.
 * Exit-impersonation and status endpoints must run as the REAL user.
 */
function isImpersonationExempt(fullPath) {
  const lower = (fullPath || '').toLowerCase();
  return lower.includes('/exit-impersonation') || lower.includes('/impersonation-status');
}

/**
 * Express middleware factory — returns the auth middleware function.
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

      const claims = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      const uid = claims?.sub || claims?.id;
      const tokenHash = claims?.ph || null;

      if (!uid) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { tenantCode, schemaName, isAdminArea, isCoreAuthSelf, homeTenantSchema, isCrossTenant } =
        resolveTenantContext({
          headers: req.headers,
          claims,
          fullPath,
        });

      if (!schemaName && !isCoreAuthSelf) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // ── Impersonation detection ───────────────────────────────────
      // Check Redis for an active impersonation session. If found (and the
      // path isn't an exit/status endpoint), swap to the target user's identity.
      let impersonating = null;
      if (!isImpersonationExempt(fullPath)) {
        try {
          const redis = await getRedis();
          const impData = await redis.get(`imp:${uid}`);
          if (impData) impersonating = JSON.parse(impData);
        } catch {
          // Redis unavailable — proceed without impersonation
        }
      }

      if (impersonating) {
        // Load target user's permissions from their tenant schema
        const targetPermsRecord = await loadPermissions({
          userId: impersonating.targetUserId,
          schemaName: impersonating.targetSchemaName,
          tenantCode: impersonating.targetTenantCode,
          bypassRbac: false,
        });

        req.user = {
          id: impersonating.targetUserId,
          email: impersonating.targetUser.email,
          user_name: impersonating.targetUser.user_name,
          role: impersonating.targetUser.role,
          status: impersonating.targetUser.status,
          tenant_code: impersonating.targetTenantCode,
          schema_name: impersonating.targetSchemaName,
          perms: targetPermsRecord.perms,
          impersonated_by: uid,
          impersonation_log_id: impersonating.logId,
          is_impersonating: true,
        };

        req.ctx = {
          ...(req.ctx || {}),
          user_id: impersonating.targetUserId,
          tenant_code: impersonating.targetTenantCode,
          schema: impersonating.targetSchemaName,
          perms: targetPermsRecord.perms,
          impersonated_by: uid,
          is_impersonating: true,
        };

        return next();
      }

      // ── Normal (non-impersonating) flow ───────────────────────────
      // For RBAC policy loading, use the user's home tenant schema (e.g. 'nap')
      // even when the route is in admin-area or the user is cross-tenant.
      const rbacSchema =
        isAdminArea && homeTenantSchema && homeTenantSchema !== 'admin'
          ? homeTenantSchema
          : isCrossTenant && homeTenantSchema
            ? homeTenantSchema
            : schemaName;

      const permsRecord = await loadPermissions({
        userId: uid,
        schemaName: rbacSchema,
        tenantCode: homeTenantSchema || tenantCode,
        bypassRbac: isCoreAuthSelf,
      });

      // Hydrate user profile from Redis cache or DB (JWT is minimal: sub + ph only)
      let userProfile = permsRecord?.user || null;
      if (!userProfile) {
        try {
          const dbMod = await import('../db/db.js');
          const dbFn = dbMod.default || dbMod.db;
          const full = await dbFn('napUsers', 'admin').findOneBy([{ id: uid }]);
          if (full) {
            userProfile = {
              id: full.id,
              email: full.email,
              user_name: full.user_name,
              role: full.role,
              status: full.status,
              tenant_id: full.tenant_id,
              tenant_code: full.tenant_code,
            };
          }
        } catch {
          // proceed with minimal user
        }
      }

      req.user = {
        id: uid,
        email: userProfile?.email || claims?.email,
        user_name: userProfile?.user_name || claims?.user_name,
        role: userProfile?.role || claims?.role,
        status: userProfile?.status || null,
        tenant_id: userProfile?.tenant_id || null,
        tenant_code: tenantCode || userProfile?.tenant_code || null,
        schema_name: schemaName,
        perms: permsRecord.perms,
        home_tenant: homeTenantSchema,
        rbac_schema: rbacSchema,
        is_cross_tenant: isCrossTenant,
      };

      req.ctx = {
        ...(req.ctx || {}),
        user_id: uid,
        tenant_code: tenantCode || null,
        schema: schemaName || null,
        perms: permsRecord.perms,
        home_tenant: homeTenantSchema,
        is_cross_tenant: isCrossTenant,
      };

      // Detect stale token permissions
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
