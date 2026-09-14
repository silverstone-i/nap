/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { withTenantTransaction } from '../db/withTenantTransaction.js';
import { HttpError } from '../util/httpError.js';
import type { AdminTransaction } from '../db/withAdminTransaction.js';
import type { AdminRepositories } from '../db/admin/repositories.js';
import type { CellHandle } from '../db/cell/repositories.js';
/** Does: Writes a tenant projection through its RLS transaction. Called by: activation and member synchronization. */
export async function projectTenant(
  tx: AdminTransaction<AdminRepositories>,
  cell: CellHandle,
  id: string
) {
  const tenant = await tx.tenants.findById(id);
  if (!tenant) throw new HttpError('NOT_FOUND');
  await withTenantTransaction(cell, id, async local => {
    const row = await local.cell_tenants.findById(id);
    if (row && row.revision <= tenant.revision)
      await local.cell_tenants.update(id, {
        revision: tenant.revision,
        code: tenant.tenant_code,
        status: tenant.status,
      });
    else if (!row)
      await local.cell_tenants.insert({
        revision: tenant.revision,
        id,
        tenant_id: id,
        code: tenant.tenant_code,
        status: tenant.status,
      });
  });
}
