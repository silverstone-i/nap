/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { matchesCapability } from '../../../capability/index.js';
import { PLATFORM_ADMIN_CAPABILITIES } from '../../../capability/systemRoles.js';
import { AdminAccessError } from './errors.js';

function matches(capabilities, requested) {
  return capabilities.some(capability =>
    matchesCapability(capability, requested)
  );
}

export async function resolveAuthorization(db, roleProvider, session) {
  const user = await db.portal_users.findOneBy(
    { id: session.user, status: 'active' },
    { columnWhitelist: ['id', 'is_root'] }
  );
  if (!user) throw new AdminAccessError('FORBIDDEN');
  const owner = await db.tenants.findOneBy(
    { is_napsoft: true, status: 'active' },
    { columnWhitelist: ['id'] }
  );
  if (
    user.is_root &&
    session.restricted !== true &&
    session.accessMode === 'normal'
  )
    return {
      actorId: user.id,
      ownerTenantId: owner?.id ?? null,
      platform: 'root',
      platformCapabilities: [...PLATFORM_ADMIN_CAPABILITIES],
      tenantGrants: [],
    };

  const assignments = await db.platform_roles.findWhere(
    { portal_user_id: user.id },
    'AND',
    { columnWhitelist: ['tenant_id', 'role_id'] }
  );
  const memberships = await db.portal_user_tenants.findWhere(
    { portal_user_id: user.id, status: 'active' },
    'AND',
    { columnWhitelist: ['tenant_id'] }
  );
  const memberTenants = new Set(memberships.map(row => row.tenant_id));
  const byTenant = Map.groupBy(
    assignments.filter(row => memberTenants.has(row.tenant_id)),
    row => row.tenant_id
  );
  const tenantGrants = [];
  let platform = null;
  let platformCapabilities = [];
  for (const [tenantId, rows] of byTenant) {
    let roles;
    try {
      roles = await roleProvider.resolve(
        tenantId,
        rows.map(row => row.role_id)
      );
    } catch (error) {
      if (error?.code === 'SERVICE_UNAVAILABLE') throw error;
      roles = [];
    }
    for (const role of roles) {
      tenantGrants.push({ tenantId, capabilities: role.capabilities });
      if (
        tenantId === owner?.id &&
        ['platform_admin', 'support'].includes(role.systemRole)
      ) {
        if (role.systemRole === 'platform_admin' || platform === null)
          platform = role.systemRole;
        platformCapabilities.push(...role.capabilities);
      }
    }
  }
  return {
    actorId: user.id,
    ownerTenantId: owner?.id ?? null,
    platform,
    platformCapabilities: [...new Set(platformCapabilities)],
    tenantGrants,
  };
}

export function permits(context, capability, tenantId = null) {
  if (matches(context.platformCapabilities, capability)) {
    if (
      context.platform === 'support' &&
      tenantId &&
      tenantId === context.ownerTenantId
    )
      return false;
    return true;
  }
  return (
    tenantId !== null &&
    context.tenantGrants.some(
      grant =>
        grant.tenantId === tenantId && matches(grant.capabilities, capability)
    )
  );
}

export function requireCapability(context, capability, tenantId = null) {
  if (!permits(context, capability, tenantId))
    throw new AdminAccessError('FORBIDDEN');
}

export function accessScope(context, capability) {
  if (matches(context.platformCapabilities, capability))
    return {
      platformPortalUserRead: true,
      tenantIds: '*',
      deniedTenantIds:
        context.platform === 'support' && context.ownerTenantId
          ? [context.ownerTenantId]
          : [],
      archiveManagement: context.platform !== 'support',
    };
  return {
    platformPortalUserRead: false,
    tenantIds: context.tenantGrants
      .filter(grant => matches(grant.capabilities, capability))
      .map(grant => grant.tenantId),
    deniedTenantIds: [],
    archiveManagement: false,
  };
}
