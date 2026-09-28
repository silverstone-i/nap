/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { withTenantTransaction } from '../../../infrastructure/runtime/tenantTransaction.js';
import { AdminAccountError } from '../../admin-tenancy/domain/errors.js';

/** Roles that must be removed before their holder's account becomes ineligible. */
const ADMIN_ROLES = Object.freeze(['tenant_admin', 'platform_admin']);

async function hasAdminAssignment(runtime, tenant, userId) {
  if (!tenant?.cell_id) return false;
  if (!runtime) throw new AdminAccountError('CELL_UNAVAILABLE');
  let cell;
  try {
    cell = runtime.dbFor(tenant.cell_id);
  } catch {
    throw new AdminAccountError('CELL_UNAVAILABLE');
  }
  return withTenantTransaction(cell, tenant.id, async tx => {
    for (const code of ADMIN_ROLES) {
      if (code === 'platform_admin' && !tenant.is_napsoft) continue;
      const role = await cell.roles.lockByCode(tenant.id, code, { tx });
      if (
        role &&
        !role.deactivated_at &&
        (await cell.role_assignments.lockActive(userId, role.id, { tx }))
      )
        return true;
    }
    return false;
  });
}

/**
 * Reject account deactivation while the user holds a tenant administrator
 * role. Removing the role first applies M0003-R012's last-admin guard.
 *
 * @param {{portal_user_tenants: object, tenants: object}} admin Admin repositories.
 * @param {{dbFor: (cellId: string) => object}} runtime Ready-cell registry.
 * @param {string} userId Portal user being disabled or archived.
 * @returns {Promise<void>}
 * @throws {AdminAccountError} `ADMIN_ASSIGNED` or `CELL_UNAVAILABLE`
 */
export async function assertAccountDeactivationAllowed(admin, runtime, userId) {
  const memberships = await admin.portal_user_tenants.findWhere(
    { portal_user_id: userId, status: 'active' },
    'AND',
    { columnWhitelist: ['tenant_id'] }
  );
  for (const membership of memberships) {
    const tenant = await admin.tenants.findOneBy(
      { id: membership.tenant_id },
      { columnWhitelist: ['id', 'cell_id', 'is_napsoft'] }
    );
    if (await hasAdminAssignment(runtime, tenant, userId))
      throw new AdminAccountError('ADMIN_ASSIGNED');
  }
}

/** Reject suspension or archival while this tenant membership holds an administrator role. */
export async function assertMembershipDeactivationAllowed(
  admin,
  runtime,
  membership
) {
  const tenant = await admin.tenants.findOneBy(
    { id: membership.tenant_id },
    { columnWhitelist: ['id', 'cell_id', 'is_napsoft'] }
  );
  if (await hasAdminAssignment(runtime, tenant, membership.portal_user_id))
    throw new AdminAccountError('ADMIN_ASSIGNED');
}
