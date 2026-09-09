/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { accessCatalog } from './accessCatalog.js';
import type { CellRepositories } from '../db/cell/repositories.js';
import type { CellTransaction } from '../db/withTenantTransaction.js';
/** Does: Seeds immutable identities and initial editable roles once. Called by: provisioning and explicit seed commands. */
export async function seedTenantRoles(
  tx: CellTransaction<CellRepositories>,
  tenantId: string
) {
  const definitions = [
    {
      code: 'tenant_admin',
      name: 'Tenant Administrator',
      permanent: true,
      capabilities: [] as string[],
    },
    ...accessCatalog.flatMap(r =>
      ['viewer', 'manager'].map(kind => ({
        code: `${r.resource.startsWith('core') ? 'company' : 'project'}_${kind}`,
        name: `${r.label} ${kind}`,
        permanent: false,
        capabilities: r.capabilities.filter(
          c =>
            kind === 'manager' || c.endsWith('::read') || c.endsWith('::list')
        ),
      }))
    ),
    {
      code: 'executive',
      name: 'Executive',
      permanent: false,
      capabilities: accessCatalog.flatMap(r =>
        r.capabilities.filter(c => c.endsWith('::read') || c.endsWith('::list'))
      ),
    },
  ];
  for (const definition of definitions) {
    const existing = await tx.roles.findWhere(
      { tenant_id: tenantId, code: definition.code },
      'AND',
      { includeDeactivated: true }
    );
    if (!existing.length)
      await tx.roles.insert({
        tenant_id: tenantId,
        ...definition,
        capabilities: JSON.stringify(definition.capabilities),
        fields: JSON.stringify([]),
      });
  }
}
/** Does: Assigns the initial tenant administrator once. Called by: provisioning and reviewed transition. */
export async function seedTenantAdmin(
  tx: CellTransaction<CellRepositories>,
  tenantId: string,
  bindingId: string
) {
  await seedTenantRoles(tx, tenantId);
  const role = await tx.roles.findOneBy({ code: 'tenant_admin' });
  if (!role) throw new Error('Missing tenant administrator role');
  const existing = await tx.role_assignments.findWhere(
    { role_id: role.id, binding_id: bindingId },
    'AND',
    { includeDeactivated: true }
  );
  if (!existing.length)
    await tx.role_assignments.insert({
      tenant_id: tenantId,
      role_id: role.id,
      binding_id: bindingId,
      scope: 'tenant',
    });
}
