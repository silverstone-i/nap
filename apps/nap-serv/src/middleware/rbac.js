/**
 * @file RBAC middleware — policy-based access control per PRD §3.1.2
 * @module nap-serv/middleware/rbac
 *
 * rbac(requiredLevel) enforces permission level using policy resolution hierarchy:
 *   module::router::action → module::router:: → module:::: → :::: → none
 *
 * No bypass for super_user or admin — all users resolve through full
 * policy resolution. System roles achieve access via seeded policies.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import logger from '../lib/logger.js';

const LEVEL_ORDER = { none: 0, view: 1, full: 2 };

/**
 * Resolve the effective permission level from a capabilities map.
 * Checks most-specific key first, falling back to broader grants:
 *   module::router::action → module::router:: → module:::: → :::: (wildcard)
 *
 * The final '::::' fallback matches the empty-module wildcard policy seeded
 * for admin/super_user roles, ensuring they pass without per-module entries.
 *
 * @param {object} caps Capabilities map from permission canon
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
    '::::',
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
 *
 * All users — including super_user and admin — are enforced through
 * policy resolution. System roles achieve full access via seeded policies.
 *
 * @param {string} [requiredHint] Required permission level. If omitted:
 *   GET/HEAD → 'view', mutations → 'full'
 * @returns {Function} Express middleware
 */
export function rbac(requiredHint) {
  return async (req, res, next) => {
    try {
      const user = req.user || {};
      const resource = req.resource || {};
      const moduleName = resource.module || '';
      const routerName = resource.router || '';
      const actionName = resource.action || '';

      // Determine required level
      const required = requiredHint || (req.method === 'GET' || req.method === 'HEAD' ? 'view' : 'full');

      // Read capabilities from permission canon (populated by authRedis)
      const caps = user.permissions?.caps || {};

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
