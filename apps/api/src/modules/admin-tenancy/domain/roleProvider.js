/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  listTenantRoles,
  resolveTenantRoles,
} from '../../access-control/domain/roleCatalogue.js';

export class RoleProviderError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function createRoleProvider(admin, cells) {
  async function handleForTenant(tenantId) {
    const tenant = await admin.tenants.findOneBy(
      { id: tenantId, status: 'active' },
      { columnWhitelist: ['id', 'cell_id', 'is_napsoft'] }
    );
    if (!tenant) throw new RoleProviderError('NOT_FOUND');
    if (!tenant.cell_id || !cells)
      throw new RoleProviderError('SERVICE_UNAVAILABLE');
    try {
      return { tenant, handle: cells.get(tenant.cell_id) };
    } catch {
      throw new RoleProviderError('SERVICE_UNAVAILABLE');
    }
  }

  return {
    async list(tenantId) {
      const { handle } = await handleForTenant(tenantId);
      return listTenantRoles(handle, tenantId);
    },
    async resolve(tenantId, roleIds) {
      const { handle } = await handleForTenant(tenantId);
      return resolveTenantRoles(handle, tenantId, roleIds);
    },
  };
}
