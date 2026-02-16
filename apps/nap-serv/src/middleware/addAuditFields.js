/**
 * @file Audit field middleware — injects created_by/updated_by from req.user
 * @module nap-serv/middleware/addAuditFields
 *
 * POST: injects created_by, tenant_code from req.user
 * PUT/PATCH/DELETE: injects updated_by (updated_at is managed by pg-schemata)
 *
 * Note: created_by/updated_by are uuid values (req.user.id) per pg-schemata
 * audit field config with userFields.type: 'uuid'.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

export function addAuditFields(req, res, next) {
  const userId = req.user?.id;
  if (!userId) return res.status(400).json({ message: 'Missing user context for audit fields.' });

  const path = req.originalUrl || '';
  let tenantCode = req.user?.tenant_code;
  if (path.endsWith('tenants/') || path.endsWith('nap-users/register')) {
    tenantCode = req.body?.tenant_code || tenantCode;
  }

  if (!req.body) req.body = {};

  const applyAuditFields = (record) => {
    if (req.method === 'POST') {
      if (tenantCode) record.tenant_code = tenantCode;
      record.created_by = userId;
    }
    if (req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') {
      record.updated_by = userId;
    }
  };

  if (Array.isArray(req.body)) {
    req.body.forEach(applyAuditFields);
  } else {
    applyAuditFields(req.body);
  }

  next();
}

export default addAuditFields;
