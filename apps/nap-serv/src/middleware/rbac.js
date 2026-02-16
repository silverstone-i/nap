/**
 * @file RBAC middleware — policy-based access control per PRD §3.1.2
 * @module nap-serv/middleware/rbac
 *
 * withMeta({ module, router, action }) annotates req.resource for downstream RBAC checks.
 * rbac(requiredLevel) enforces permission level using policy resolution hierarchy:
 *   module::router::action → module::router:: → module:::: → none
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { loadPoliciesForUserTenant } from '../utils/RbacPolicies.js';
import logger from '../utils/logger.js';

const LEVEL_ORDER = { none: 0, view: 1, full: 2 };

/**
 * Annotate req.resource with module/router/action metadata.
 * @param {object} meta
 * @param {string} meta.module Module name (e.g., 'ar', 'projects')
 * @param {string} [meta.router] Router name (e.g., 'invoices')
 * @param {string} [meta.action] Action name (e.g., 'approve')
 * @returns {Function} Express middleware
 */
export function withMeta({ module, router = '', action = '' }) {
  return (req, _res, next) => {
    req.resource = { module, router, action };
    next();
  };
}

/**
 * Resolve the effective permission level from a capabilities map.
 * Checks most-specific key first: module::router::action → module::router:: → module::::
 * @param {object} caps Capabilities map from loadPoliciesForUserTenant
 * @param {string} moduleName
 * @param {string} routerName
 * @param {string} actionName
 * @returns {string} Resolved level: 'none', 'view', or 'full'
 */
export function resolveLevel(caps, moduleName, routerName, actionName) {
  const keys = [
    `${moduleName}::${routerName}::${actionName}`,
    `${moduleName}::${routerName}::`,
    `${moduleName}::::`,
  ];
  for (const k of keys) {
    const level = caps[k];
    if (level) return level;
  }
  return 'none';
}

/**
 * Build a 403 deny response with detailed payload.
 */
function deny(res, user, req, needed, have, note) {
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

  try {
    logger.warn('RBAC deny', payload);
  } catch {
    /* ignore logger errors */
  }

  return res.status(403).json(payload);
}

/**
 * RBAC enforcement middleware.
 * @param {string} [requiredHint] Required permission level. If omitted:
 *   GET/HEAD → 'view', mutations → 'full'
 * @returns {Function} Express middleware
 */
export function rbac(requiredHint) {
  return async (req, res, next) => {
    try {
      const ctx = req.ctx || {};
      const user = ctx.user || req.user || {};
      const schemaName = ctx.schema || user.schema_name || null;
      const systemRole = user.role || null;

      // Short-circuit: super_admin bypasses all checks
      if (systemRole === 'super_admin') return next();

      // Short-circuit: tenant admin bypasses all except tenants module
      if (systemRole === 'admin') {
        if (req?.resource?.module !== 'tenants') return next();
        return deny(res, user, req, 'full', 'none', 'admin cannot access tenants module');
      }

      const resource = req.resource || {};
      const moduleName = resource.module || '';
      const routerName = resource.router || '';
      const actionName = resource.action || '';

      // Determine required level
      const required = requiredHint || (req.method === 'GET' || req.method === 'HEAD' ? 'view' : 'full');

      // Load effective policies for this user/tenant
      let caps = {};
      if (schemaName && user?.id) {
        caps = await loadPoliciesForUserTenant({ schemaName, userId: user.id });
      }

      const have = resolveLevel(caps, moduleName, routerName, actionName);

      if (LEVEL_ORDER[have] >= LEVEL_ORDER[required]) return next();

      return deny(res, user, req, required, have);
    } catch (err) {
      logger.error('RBAC middleware error', { error: err?.message });
      return res.status(500).json({ error: 'RBAC error' });
    }
  };
}

export default rbac;
