'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

export function addAuditFields(req, res, next) {
  const userName = req.user?.user_name; // assuming decoded JWT sets `req.user`
  const path = req.originalUrl;
  const tenantCode = path.endsWith('tenants/') || path.endsWith('nap-users/register') ? req.body.tenant_code : req.user?.tenant_code;

  if (!userName || !tenantCode) return res.status(400).json({ message: 'Missing user context for audit fields.' });

  if (!req.body) req.body = {};

  // Helper to apply audit fields to a single record
  const applyAuditFields = record => {
    if (req.method === 'POST') {
      record.tenant_code = tenantCode;
      record.created_by = userName;
    }
    if (req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') {
      record.updated_at = new Date().toISOString();
      record.updated_by = userName;
    }
  };

  if (Array.isArray(req.body)) {
    req.body.forEach(applyAuditFields);
  } else {
    applyAuditFields(req.body);
  }

  next();
}
