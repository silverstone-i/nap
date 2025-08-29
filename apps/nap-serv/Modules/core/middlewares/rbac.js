'use strict';

import { loadPoliciesForUserTenant } from '../../../src/utils/RbacPolicies.js';
import logger from '../../../src/utils/logger.js';

function deny(res, user, req, have, required, reason = 'forbidden') {
  if (logger && typeof logger.warn === 'function')
    logger.warn('RBAC deny', { have, required, user: user?.email, path: req.originalUrl, reason });
  return res.status(403).json({ error: 'Forbidden' });
}

export const rbac = (requiredHint) => {
  return async (req, res, next) => {
    try {
      const user = req.ctx?.user || req.user || null;
      const tenantId = req.ctx?.tenant?.id || req.user?.tenant_id || null;
      const resource = req.resource || {};

      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const moduleName = resource.module || '';
      const routerName = resource.router || '';
      const actionName = resource.action || '';

      let required = requiredHint;
      if (!required) {
        required = req.method === 'GET' || req.method === 'HEAD' ? 'view' : 'full';
      }

      let caps = {};
      if (tenantId && user?.id) {
        caps = await loadPoliciesForUserTenant({ tenantId, userId: user.id });
      }

      const have = resolveLevel(caps, moduleName, routerName, actionName);
      const levels = { none: 0, view: 1, full: 2 };
      if ((levels[have] || 0) < (levels[required] || 0)) {
        return deny(res, user, req, have, required);
      }
      next();
    } catch (err) {
      if (logger && typeof logger.error === 'function') logger.error('RBAC middleware error', { error: err?.message });
      return res.status(500).json({ error: 'RBAC error' });
    }
  };
};

function resolveLevel(caps, moduleName, routerName, actionName) {
  const keys = [`${moduleName}::${routerName}::${actionName}`, `${moduleName}::${routerName}::`, `${moduleName}::::`];
  for (const k of keys) {
    if (caps[k]) return caps[k];
  }
  return 'none';
}

export default rbac;
