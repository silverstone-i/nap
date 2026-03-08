/**
 * @file Module entitlement middleware — checks tenant's allowed_modules
 * @module nap-serv/middleware/moduleEntitlement
 *
 * Enforced after auth and before RBAC. If the tenant's allowed_modules
 * does not include the requested module, returns 403.
 *
 * An empty allowed_modules array means all modules are allowed.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

/**
 * Express middleware that checks module entitlement for the current tenant.
 */
export function moduleEntitlement(req, res, next) {
  const allowedModules = req.ctx?.tenant?.allowed_modules;
  const requestedModule = req.resource?.module;

  if (!requestedModule) return next();

  // Empty array = all modules allowed (no restrictions)
  if (!Array.isArray(allowedModules) || allowedModules.length === 0) {
    return next();
  }

  if (allowedModules.includes(requestedModule)) {
    return next();
  }

  return res.status(403).json({ error: 'Module not available for this tenant' });
}

export default moduleEntitlement;
