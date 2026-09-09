/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { withTenantTransaction } from '../db/withTenantTransaction.js';
import { HttpError } from '../util/httpError.js';
import { audit, requirePlatform } from './platform.js';
import type { AdminRepositories } from '../db/admin/repositories.js';
import type { AdminTransaction } from '../db/withAdminTransaction.js';
import type { CellHandle } from '../db/cell/repositories.js';
/** Does: Writes and projects an explicit optional-module grant. Called by: operator commands in the assigned cell. */
export async function changeEntitlement(
  tx: AdminTransaction<AdminRepositories>,
  cell: CellHandle | undefined,
  operator: string,
  input: { tenant: string; module: 'projects'; enabled: boolean },
  cellCode: string
) {
  await requirePlatform(tx, operator, 'entitlement');
  const tenant = await tx.cells.assignment(input.tenant);
  if (!tenant || tenant.code !== cellCode || !tenant.enabled || !cell)
    throw new HttpError('FORBIDDEN');
  await tx.tenants.lockBootstrap();
  let row = await tx.module_entitlements.findOneBy({
    tenant_id: input.tenant,
    module: input.module,
  });
  if (row) {
    const revision =
      row.enabled === input.enabled ? row.revision : row.revision + 1;
    await tx.module_entitlements.update(row.id, {
      enabled: input.enabled,
      revision,
    });
    row = { ...row, enabled: input.enabled, revision };
  } else
    row = await tx.module_entitlements.insert({
      tenant_id: input.tenant,
      module: input.module,
      enabled: input.enabled,
      revision: 1,
    });
  await audit(
    tx,
    operator,
    'module-entitlement',
    input.tenant,
    JSON.stringify({
      module: row.module,
      enabled: row.enabled,
      revision: row.revision,
    })
  );
  // A failed cross-database projection must not undo a central revocation.
  let projected = false;
  try {
    await withTenantTransaction(cell, input.tenant, async local => {
      const existing = await local.entitlement_projections.findOneBy({
        module: input.module,
      });
      if (existing && existing.revision > row.revision)
        throw new HttpError('CONFLICT');
      if (existing)
        await local.entitlement_projections.update(existing.id, {
          enabled: row.enabled,
          revision: row.revision,
        });
      else
        await local.entitlement_projections.insert({
          tenant_id: input.tenant,
          module: input.module,
          enabled: row.enabled,
          revision: row.revision,
        });
    });
    projected = true;
  } catch {
    projected = false;
  }
  return { id: row.id, projected };
}
