'use strict';

import { loadPoliciesForUserTenant } from '../utils/RbacPolicies.js';
import logger from '../utils/logger.js';

const order = { none: 0, view: 1, full: 2 };

export const rbac = (requiredHint) => {
  return async (req, res, next) => {
    try {
      const ctx = req.ctx || {};
      const user = ctx.user || req.user || {};
      const tenantId = ctx.tenant?.id || req.user?.tenant_id || null;
      const systemRoles = ctx.system_roles || user.system_roles || [];

      // Short-circuit: superadmin bypass
      if (Array.isArray(systemRoles) && systemRoles.includes('superadmin')) return next();

      // Short-circuit: tenant admin bypass for non-tenants module
      if (Array.isArray(systemRoles) && systemRoles.includes('admin')) {
        if (req?.resource?.module !== 'tenants') return next();
        return deny(res, user, req, 'full', 'none', 'admin cannot access tenants module');
      }

      // Resolve effective level from policies
      const resource = req.resource || {};
      const moduleName = resource.module || '';
      const routerName = resource.router || '';
      const actionName = resource.action || '';

      // Determine required level
      let required = requiredHint;
      if (!required) {
        required = req.method === 'GET' || req.method === 'HEAD' ? 'view' : 'full';
      }

      // Load effective policies for this user/tenant
      let caps = {};
      if (tenantId && user?.id) {
        caps = await loadPoliciesForUserTenant({ tenantId, userId: user.id });
      }

      const have = resolveLevel(caps, moduleName, routerName, actionName);

      if (order[have] >= order[required]) return next();

      return deny(res, user, req, required, have);
    } catch (err) {
      logger.error('RBAC middleware error', { error: err?.message });
      return res.status(500).json({ error: 'RBAC error' });
    }
  };
};

function resolveLevel(caps, moduleName, routerName, actionName) {
  const keys = [`${moduleName}::${routerName}::${actionName}`, `${moduleName}::${routerName}::`, `${moduleName}::::`];
  for (const k of keys) {
    const level = caps[k];
    if (level) return level;
  }
  return 'none';
}

function deny(res, user, req, needed, have, note) {
  try {
    const payload = {
      userId: user?.id || user?.email || null,
      tenantId: req.ctx?.tenant?.id || user?.tenant_id || null,
      module: req.resource?.module,
      router: req.resource?.router,
      action: req.resource?.action,
      method: req.method,
      needed,
      have: have || 'none',
      note,
    };
    // Best-effort log; don't crash on logging issues
    try {
      if (logger && typeof logger.warn === 'function') logger.warn('RBAC deny', payload);
    } catch {
      /* ignore logger errors */
    }
    return res.status(403).json(payload);
  } catch {
    return res.status(403).json({ error: 'Forbidden', needed, have: have || 'none' });
  }
}

export default rbac;
