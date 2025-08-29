'use strict';

import db from '../db/db.js';
import { computePolicyEtag } from '../utils/policyEtag.js';

// Populate req.ctx with { user, tenant, system_roles, tenant_roles, policy_etag }
export async function context(req, res, next) {
  try {
    const user = req.user || null;
    if (!user) return next();

    // Resolve tenant by tenant_code from JWT
    const tenantCode = user.tenant_code?.toLowerCase?.() || null;
    let tenant = null;
    if (tenantCode) {
      try {
        tenant = await db('tenants', 'admin').findOneWhere([{ tenant_code: tenantCode }]);
      } catch {
        tenant = null;
      }
    }

    // Map system roles from legacy JWT roles
    const system_roles = [];
    if (user.role === 'superadmin') system_roles.push('superadmin');
    if (user.role === 'admin') system_roles.push('admin');

    // Resolve nap_user id by email when present
    let napUserId = null;
    if (user.email) {
      try {
        const napUser = await db('napUsers', 'admin').findOneWhere([{ email: user.email }], undefined, {
          columnWhitelist: ['id'],
        });
        napUserId = napUser?.id || null;
      } catch {
        napUserId = null;
      }
    }

    // Resolve tenant role memberships when tenant + user id known
    let tenant_roles = [];
    if (tenant?.id && napUserId) {
      try {
        const memberships = await db('roleMembers', 'public').findWhere([{ tenant_id: tenant.id }, { user_id: napUserId }], 'AND', {
          columnWhitelist: ['role_id'],
        });
        tenant_roles = memberships?.map((m) => m.role_id) || [];
      } catch {
        tenant_roles = [];
      }
    }

    // Compute policy etag for this tenant (advisory)
    const policy_etag = tenant?.id ? await computePolicyEtag(tenant.id) : null;

    req.ctx = { user, tenant, system_roles, tenant_roles, policy_etag };
    return next();
  } catch {
    // Non-fatal: proceed without ctx
    return next();
  }
}

export default context;
