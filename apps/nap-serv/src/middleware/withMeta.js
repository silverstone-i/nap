/**
 * @file withMeta middleware — annotates req.resource with module/router/action metadata
 * @module nap-serv/middleware/withMeta
 *
 * Used by downstream RBAC middleware to determine which permission to check.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/**
 * Annotate req.resource with module/router/action metadata.
 *
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

export default withMeta;
