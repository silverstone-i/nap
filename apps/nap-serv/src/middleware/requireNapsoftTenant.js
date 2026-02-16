/**
 * @file requireNapsoftTenant — restricts access to NapSoft tenant users
 * @module nap-serv/middleware/requireNapsoftTenant
 *
 * Returns 403 for any request where the authenticated user does not belong
 * to the NapSoft platform tenant (per PRD §3.2).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/**
 * Express middleware that gates routes to NapSoft employees only.
 */
export function requireNapsoftTenant(req, res, next) {
  const napsoftTenant = (process.env.NAPSOFT_TENANT || 'NAP').toLowerCase();
  const userTenant = req.user?.tenant_code?.toLowerCase?.();

  if (!req.user || !userTenant || userTenant !== napsoftTenant) {
    return res.status(403).json({ message: 'Access denied: not a NapSoft user.' });
  }

  next();
}

export default requireNapsoftTenant;
