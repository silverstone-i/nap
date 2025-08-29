'use strict';

import db from '../../../src/db/db.js';

function schemaFromTenant(code) {
  return code?.toLowerCase?.() || null;
}

export async function tenantContext(req, res, next) {
  const a = req.auth || req.user || {};
  const effCode = a?.assumed ? a.on_behalf_of : a?.tenant_code;
  const schema = schemaFromTenant(effCode);
  const userId = a?.sub || a?.id || null;
  const actorUserId = a?.assumed ? a?.actor || userId : userId;

  // Resolve tenant row for context when possible
  let tenant = null;
  if (effCode) {
    try {
      tenant = await db('tenants', 'admin').findOneWhere([{ tenant_code: effCode.toLowerCase() }]);
    } catch {
      // ignore resolution errors; context can proceed without tenant row
    }
  }

  req.ctx = {
    ...(req.ctx || {}),
    tenant_code: effCode,
    schema,
    user_id: userId,
    actor_user_id: actorUserId,
    user: req.user || null,
    tenant,
  };

  try {
    // Ensure any subsequent model calls are schema-scoped via controllers
    // Controllers should use req.ctx.schema explicitly.
    next();
  } catch (e) {
    next(e);
  }
}

export default tenantContext;
