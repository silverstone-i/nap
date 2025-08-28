'use strict';

import crypto from 'crypto';
import db from '../db/db.js';

// Compute a stable hash over roles/role_members/policies rows for a tenant
export async function computePolicyEtag(tenantId) {
  try {
    const [roles, roleMembers, policies] = await Promise.all([
      db('roles', 'public').findWhere([{ tenant_id: tenantId }], 'AND', { columnWhitelist: ['id', 'updated_at'] }),
      db('roleMembers', 'public').findWhere([{ tenant_id: tenantId }], 'AND', { columnWhitelist: ['id', 'updated_at'] }),
      db('policies', 'public').findWhere([{ tenant_id: tenantId }], 'AND', { columnWhitelist: ['id', 'updated_at'] }),
    ]);
    const payload = JSON.stringify({
      r: roles?.map((r) => [r.id, r.updated_at]) ?? [],
      m: roleMembers?.map((rm) => [rm.id, rm.updated_at]) ?? [],
      p: policies?.map((p) => [p.id, p.updated_at]) ?? [],
    });
    return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

export default { computePolicyEtag };
