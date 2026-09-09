/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { z } from 'zod';
import { withAdminTransaction } from '../db/withAdminTransaction.js';
import { withTenantTransaction } from '../db/withTenantTransaction.js';
import { seedPlatformPolicy, audit } from './platform.js';
import { seedTenantAdmin, seedTenantRoles } from './roleSeeds.js';
import type { AdminHandle } from '../db/admin/repositories.js';
import type { CellHandle } from '../db/cell/repositories.js';
/** Does: Defines the operator-reviewed migration mapping. Used by: transition command and tests. */
export const transitionSchema = z.strictObject({
  operator: z.uuid(),
  cell: z.string().min(1),
  platform: z.array(
    z.strictObject({
      user: z.uuid(),
      role: z.enum(['platform_admin', 'support']).nullable(),
    })
  ),
  tenants: z.array(
    z.strictObject({
      tenant: z.uuid(),
      administrators: z.array(z.uuid()).min(1),
    })
  ),
});
/** Does: Applies a complete reviewed mapping to the configured cell. Called by: maintenance transition command and integration tests. */
export async function transitionAccess(
  admin: AdminHandle,
  cell: CellHandle,
  input: z.infer<typeof transitionSchema>
) {
  return withAdminTransaction(admin, async tx => {
    await tx.tenants.lockBootstrap();
    const operator = await tx.portal_users.lockIdentity(input.operator);
    if (!operator?.is_root) throw new Error('Transition operator must be root');
    if (
      new Set(input.platform.map(p => p.user)).size !== input.platform.length ||
      new Set(input.tenants.map(t => t.tenant)).size !== input.tenants.length
    )
      throw new Error('Duplicate transition target');
    const legacy = await tx.platform_grants.findWhere({});
    if (
      legacy.some(
        g =>
          g.portal_user_id !== operator.id &&
          !input.platform.some(p => p.user === g.portal_user_id)
      )
    )
      throw new Error('Unmapped legacy operator');
    const tenants = await tx.tenants.findWhere({});
    const local: typeof tenants = [];
    for (const tenant of tenants) {
      const assignment = await tx.cells.assignment(tenant.id);
      if (assignment?.code === input.cell && tenant.provisioned)
        local.push(tenant);
    }
    for (const tenant of local) {
      const members = await tx.portal_user_tenants.findWhere({
        tenant_id: tenant.id,
        status: 'active',
        ready: true,
      });
      const rootMember = members.find(m => m.portal_user_id === operator.id);
      const map = input.tenants.find(m => m.tenant === tenant.id);
      if (!rootMember && !map) throw new Error('Unmapped tenant administrator');
      if (map?.administrators.some(id => !members.some(m => m.id === id)))
        throw new Error('Invalid administrator binding');
    }
    if (input.tenants.some(t => !local.some(l => l.id === t.tenant)))
      throw new Error('Wrong-cell tenant mapping');
    for (const entry of input.platform) {
      const user = await tx.portal_users.lockIdentity(entry.user);
      if (!user || user.is_root || user.status !== 'active')
        throw new Error('Invalid platform identity');
    }
    await seedPlatformPolicy(tx);
    for (const tenant of local) {
      const bindings = await tx.portal_user_tenants.findWhere({
        tenant_id: tenant.id,
        status: 'active',
        ready: true,
      });
      const admins =
        input.tenants.find(m => m.tenant === tenant.id)?.administrators ??
        bindings.filter(b => b.portal_user_id === operator.id).map(b => b.id);
      await withTenantTransaction(cell, tenant.id, async localTx => {
        await localTx.roles.lockTenant(tenant.id);
        if (!(await localTx.cell_tenants.findById(tenant.id)))
          throw new Error('Missing tenant projection');
        for (const id of admins) {
          const binding = await localTx.tenant_user_bindings.findById(id);
          if (!binding || binding.status !== 'active')
            throw new Error('Missing administrator projection');
        }
        await seedTenantRoles(localTx, tenant.id);
        for (const id of admins) await seedTenantAdmin(localTx, tenant.id, id);
        const role = await localTx.roles.findOneBy({ code: 'tenant_admin' });
        if (
          !role ||
          (
            await localTx.role_assignments.findWhere({
              role_id: role.id,
              scope: 'tenant',
            })
          ).every(a => !admins.includes(a.binding_id))
        )
          throw new Error('Administrator mapping is inactive');
        const grants = await tx.module_entitlements.findWhere({
          tenant_id: tenant.id,
        });
        for (const grant of grants) {
          const projection = await localTx.entitlement_projections.findOneBy({
            module: grant.module,
          });
          if (projection)
            await localTx.entitlement_projections.update(projection.id, {
              enabled: grant.enabled,
              revision: grant.revision,
            });
          else
            await localTx.entitlement_projections.insert({
              tenant_id: tenant.id,
              module: grant.module,
              enabled: grant.enabled,
              revision: grant.revision,
            });
        }
        await localTx.access_events.insert({
          tenant_id: tenant.id,
          operator_id: operator.id,
          event: 'transition',
          detail: { administrators: admins },
        });
      });
    }
    for (const entry of input.platform) {
      const rows = await tx.platform_roles.findWhere(
        { portal_user_id: entry.user },
        'AND',
        { includeDeactivated: true }
      );
      for (const row of rows)
        if (row.role !== entry.role)
          await tx.platform_roles.removeWhere({ id: row.id });
      if (entry.role) {
        const row = rows.find(r => r.role === entry.role);
        if (row) await tx.platform_roles.restoreWhere({ id: row.id });
        else
          await tx.platform_roles.insert({
            portal_user_id: entry.user,
            role: entry.role,
          });
      }
    }
    for (const tenant of local)
      await tx.tenants.update(tenant.id, { rbac_ready: true });
    await audit(
      tx,
      operator.id,
      'rbac-transition',
      null,
      JSON.stringify(input)
    );
  });
}
