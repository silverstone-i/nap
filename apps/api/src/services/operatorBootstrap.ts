/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { randomUUID } from 'node:crypto';
import { withAdminTransaction } from '../db/withAdminTransaction.js';
import type { AdminTransaction } from '../db/withAdminTransaction.js';
import type {
  AdminHandle,
  AdminRepositories,
} from '../db/admin/repositories.js';
import { withTenantTransaction } from '../db/withTenantTransaction.js';
import type { CellRegistry } from './cellRegistry.js';
import { projectTenant } from './tenantProjection.js';
import { seedTenantAdmin } from './roleSeeds.js';
import { audit } from './platform.js';
import { HttpError } from '../util/httpError.js';
import { requestContext } from '../util/requestContext.js';
import type { controlResponseSchema } from '@nap/shared';
import type { z } from 'zod';

/** Does: Holds saved operator setup progress without credentials. Used by: the bootstrap worker and overview. */
type Bootstrap = NonNullable<
  z.infer<typeof controlResponseSchema>['data']['bootstrap']
>;

/** Does: Reads safe operator setup progress. Called by: the authorized management overview. */
export async function operatorBootstrapOverview(
  tx: AdminTransaction<AdminRepositories>
) {
  return tx.oneOrNone<Bootstrap>(
    'SELECT id,tenant_id,root_id,cell_id,status,failure_code FROM admin.operator_bootstrap'
  );
}

/**
 * Does: Saves the first successful database as the new operator tenant's home.
 * Called by: cell completion in the same transaction that records success.
 * Why: locking the singleton operation makes the first committed success immutable.
 */
export async function claimOperatorCell(
  tx: AdminTransaction<AdminRepositories>,
  cellId: string
) {
  const pending = await tx.oneOrNone<Bootstrap>(
    "SELECT * FROM admin.operator_bootstrap WHERE status='waiting' FOR UPDATE"
  );
  if (!pending) return;
  const cell = await tx.cells.findById(cellId);
  if (!cell?.enabled) throw new Error('Bootstrap requires an enabled cell');
  const tenant = await tx.tenants.findById(pending.tenant_id);
  if (!tenant || tenant.cell_id)
    throw new Error('Bootstrap assignment already exists');
  await tx.tenants.update(tenant.id, { cell_id: cellId });
  await tx.none(
    "UPDATE admin.operator_bootstrap SET cell_id=$1,status='queued',updated_at=now() WHERE id=$2",
    [cellId, pending.id]
  );
}

/** Does: Queues failed operator setup for its saved database. Called by: the root-only management retry command. */
export async function retryOperatorBootstrap(
  tx: AdminTransaction<AdminRepositories>,
  actor: string,
  id: string
) {
  const root = await tx.portal_users.lockIdentity(actor);
  if (!root?.is_root) throw new HttpError('FORBIDDEN');
  const row = await tx.oneOrNone<Bootstrap>(
    'SELECT * FROM admin.operator_bootstrap WHERE id=$1 FOR UPDATE',
    [id]
  );
  if (!row || row.root_id !== actor) throw new HttpError('NOT_FOUND');
  if (row.status !== 'failed') throw new HttpError('CONFLICT');
  await tx.none(
    "UPDATE admin.operator_bootstrap SET status='queued',failure_code=NULL,updated_at=now() WHERE id=$1",
    [id]
  );
}

/**
 * Does: Completes saved operator setup and records a retryable failure if synchronization fails.
 * Called by: the existing provisioning worker after cell completion and on subsequent polls.
 * Why: ADR 0015 keeps bootstrap failure independent of cell availability; row locking serializes replay.
 */
export async function completeOperatorBootstrap(
  admin: AdminHandle,
  cells: CellRegistry
) {
  // Commit progress before cell writes so overview readers can observe execution.
  // The execution transaction below still serializes running work and recovery.
  await withAdminTransaction(admin, tx =>
    tx.none(
      "UPDATE admin.operator_bootstrap SET status='running',updated_at=now() WHERE id=(SELECT id FROM admin.operator_bootstrap WHERE status='queued' FOR UPDATE SKIP LOCKED)"
    )
  );
  await withAdminTransaction(admin, async tx => {
    const row = await tx.oneOrNone<Bootstrap>(
      "SELECT * FROM admin.operator_bootstrap WHERE status='running' FOR UPDATE SKIP LOCKED"
    );
    if (!row) return;
    try {
      await requestContext.run(
        { requestId: `bootstrap:${row.id}`, actorId: row.root_id },
        async () => {
          // The savepoint rolls back readiness writes while retaining the durable failure below.
          await tx.none('SAVEPOINT operator_setup');
          if (!row.cell_id || !cells.isReady(row.cell_id))
            throw new Error('Cell unavailable');
          const root = await tx.portal_users.lockIdentity(row.root_id);
          let tenant = await tx.tenants.findById(row.tenant_id);
          const registered = await tx.cells.findById(row.cell_id);
          const members = await tx.portal_user_tenants.findWhere({
            portal_user_id: row.root_id,
          });
          const member = members[0];
          if (
            !root?.is_root ||
            root.status !== 'active' ||
            !tenant ||
            tenant.cell_id !== row.cell_id ||
            tenant.status !== 'active' ||
            !registered?.enabled ||
            members.length !== 1 ||
            !member ||
            member.tenant_id !== tenant.id ||
            member.status !== 'active' ||
            member.user_type !== null ||
            member.entity_id !== null
          )
            throw new Error('Operator identity differs from bootstrap intent');
          await tx.tenants.update(tenant.id, {
            provisioned: true,
            rbac_ready: true,
          });
          tenant = await tx.tenants.findById(row.tenant_id);
          if (!tenant) throw new Error('Operator tenant unavailable');
          const confirmedTenant = tenant;
          const cell = cells.get(row.cell_id);
          await projectTenant(tx, cell, tenant.id);
          await withTenantTransaction(cell, tenant.id, async local => {
            const binding = await local.tenant_user_bindings.findById(
              member.id
            );
            if (!binding)
              await local.tenant_user_bindings.insert({
                id: member.id,
                tenant_id: tenant.id,
                portal_user_id: root.id,
                entity_id: null,
                user_type: null,
                status: 'active',
                revision: member.revision,
              });
            await seedTenantAdmin(local, tenant.id, member.id);
            const projected = await local.cell_tenants.findById(tenant.id);
            const confirmed = await local.tenant_user_bindings.findById(
              member.id
            );
            const role = await local.roles.findOneBy({ code: 'tenant_admin' });
            const grants = role
              ? await local.role_assignments.findWhere({
                  role_id: role.id,
                  binding_id: member.id,
                  scope: 'tenant',
                })
              : [];
            if (
              !projected ||
              projected.revision !== confirmedTenant.revision ||
              projected.status !== confirmedTenant.status ||
              !confirmed ||
              confirmed.portal_user_id !== root.id ||
              confirmed.status !== member.status ||
              confirmed.entity_id !== null ||
              confirmed.user_type !== null ||
              confirmed.revision !== member.revision ||
              grants.length === 0
            )
              throw new Error('Operator projection verification failed');
          });
          await withTenantTransaction(cell, randomUUID(), async local => {
            if (
              (await local.cell_tenants.findById(tenant.id)) ||
              (await local.tenant_user_bindings.findById(member.id)) ||
              (await local.roles.findWhere({ tenant_id: tenant.id })).length ||
              (await local.role_assignments.findWhere({ tenant_id: tenant.id }))
                .length
            )
              throw new Error('Operator isolation verification failed');
          });
          await audit(
            tx,
            root.id,
            'operator-bootstrap-completed',
            tenant.id,
            'Automatic greenfield operator bootstrap'
          );
          await tx.none(
            "UPDATE admin.operator_bootstrap SET status='completed',failure_code=NULL,completed_at=now(),updated_at=now() WHERE id=$1",
            [row.id]
          );
          await tx.none('RELEASE SAVEPOINT operator_setup');
        }
      );
    } catch {
      await tx.none('ROLLBACK TO SAVEPOINT operator_setup');
      await tx.none(
        "UPDATE admin.operator_bootstrap SET status='failed',failure_code='OPERATOR_BOOTSTRAP_FAILED',updated_at=now() WHERE id=$1",
        [row.id]
      );
    }
  });
}
