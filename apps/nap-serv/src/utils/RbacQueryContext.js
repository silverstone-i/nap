/**
 * @file RBAC query context builder — translates permission canon into query modifiers
 * @module nap-serv/utils/RbacQueryContext
 *
 * Layers 2-4 narrow query results after Layer 1 grants access at the route level.
 * Returns null values for any layer that should not apply (permissive default).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/**
 * Build query modifiers from the RBAC permission canon for a specific resource.
 *
 * @param {object} perms Full permission canon from req.ctx.perms
 * @param {string} module Module name (e.g., 'ar')
 * @param {string} router Router name (e.g., 'ar-invoices')
 * @returns {object} Query context: { scope, projectIds, companyIds, visibleStatuses, allowedColumns }
 */
export function buildQueryContext(perms, module, router) {
  const key = `${module}::${router}`;
  return {
    // Layer 2: data scoping
    scope: perms?.scope || 'all_projects',
    projectIds: perms?.projectIds || null,
    companyIds: perms?.companyIds || null,

    // Layer 3: status filtering (null = all statuses visible)
    visibleStatuses: perms?.stateFilters?.[key] || null,

    // Layer 4: column restriction (null = all columns visible)
    allowedColumns: perms?.fieldGroups?.[key] || null,
  };
}

export default { buildQueryContext };
