/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { roleUrl } from '../shared/configuration.js';
import { createCellDatabase } from '../../infrastructure/runtime/cellDatabase.js';
import { COLLECTION_ENTITY } from '../../modules/admin-tenancy/domain/cache.js';

/** Thrown when root tenant setup cannot finish; the worker retries it. */
export class RootSetupError extends Error {
  constructor() {
    super('ROOT_SETUP_FAILED');
    this.code = 'ROOT_SETUP_FAILED';
  }
}

/**
 * Assign the completed cell to the Napsoft tenant when it has none
 * (I0003-R023, R024 step 1). Runs inside the transaction that completes the
 * job, through `advanceCellProvisioning`'s `onCompleted` hook, so a later
 * cell never changes the Napsoft tenant's cell.
 * @param {object} db Admin repository handle.
 * @param {object} tx The completing transaction.
 * @param {{cell_id: string}} operation The completed job.
 * @returns {Promise<void>}
 */
export async function assignNapsoftCell(db, tx, operation) {
  const napsoft = await db.tenants.lockNapsoft({ tx });
  if (!napsoft || napsoft.cell_id) return;
  await db.tenants.update(napsoft.id, { cell_id: operation.cell_id }, { tx });
  await db.cache_revisions.advance(
    [
      { domain: 'tenant', entity: napsoft.id },
      { domain: 'tenant', entity: COLLECTION_ENTITY },
    ],
    { tx }
  );
}

/**
 * Finish root tenant setup when the Napsoft tenant has a cell but is not yet
 * provisioned (I0003-R024 steps 2–6). Safe to call on every worker check:
 * it does nothing once the tenant is provisioned.
 *
 * Writes the Napsoft tenant and root's membership into the cell as
 * `nap-admin`, reads both back and compares them with admin, then marks the
 * tenant provisioned and `rbac_ready` (R026: root's authority comes from
 * `is_root`, so it needs no cell-side roles). On failure the tenant stays
 * unprovisioned and the cell's job carries `ROOT_SETUP_FAILED` until a later
 * check succeeds (R025).
 * @param {object} db Admin repository handle.
 * @param {{connection: (job: {cell: object}) => Promise<{endpoint: string, adminPassword: string}>}} driver
 * @param {{connect?: typeof createCellDatabase}} [options]
 * @returns {Promise<'none'|'completed'>}
 * @throws {RootSetupError}
 */
export async function runRootTenantSetup(
  db,
  driver,
  { connect = createCellDatabase } = {}
) {
  const tenant = await db.tenants.findOneBy(
    { is_napsoft: true },
    {
      columnWhitelist: [
        'id',
        'tenant_code',
        'status',
        'revision',
        'cell_id',
        'provisioned',
      ],
    }
  );
  if (!tenant?.cell_id || tenant.provisioned) return 'none';
  const cellId = tenant.cell_id;
  try {
    const root = await db.portal_users.findOneBy(
      { is_root: true },
      { columnWhitelist: ['id'] }
    );
    const membership =
      root &&
      (await db.portal_user_tenants.findOneBy(
        { portal_user_id: root.id, tenant_id: tenant.id },
        {
          columnWhitelist: [
            'id',
            'portal_user_id',
            'tenant_id',
            'status',
            'revision',
          ],
        }
      ));
    const cell = await db.cells.findOneBy(
      { id: cellId },
      { columnWhitelist: ['id', 'database_name'] }
    );
    if (!membership || !cell) throw new RootSetupError();

    const expectedTenant = {
      id: tenant.id,
      tenant_code: tenant.tenant_code,
      status: tenant.status,
      revision: tenant.revision,
    };
    const expectedMember = {
      id: membership.id,
      tenant_id: tenant.id,
      portal_user_id: membership.portal_user_id,
      member_type: null,
      member_id: null,
      status: membership.status,
      revision: membership.revision,
    };

    const target = await driver.connection({ cell });
    const handle = connect(
      roleUrl(target.endpoint, 'nap-admin', target.adminPassword)
    );
    try {
      await handle.connect();
      await handle.db.tx(async tx => {
        await handle.db.tenants.upsert(expectedTenant, ['id'], null, { tx });
        await handle.db.tenant_members.upsert(expectedMember, ['id'], null, {
          tx,
        });
      });
      const [storedTenant, storedMember] = await Promise.all([
        handle.db.tenants.findOneBy(
          { id: tenant.id },
          { columnWhitelist: Object.keys(expectedTenant) }
        ),
        handle.db.tenant_members.findOneBy(
          { id: membership.id },
          { columnWhitelist: Object.keys(expectedMember) }
        ),
      ]);
      const matches = (stored, expected) =>
        stored &&
        Object.entries(expected).every(
          ([key, value]) => (stored[key] ?? null) === value
        );
      if (
        !matches(storedTenant, expectedTenant) ||
        !matches(storedMember, expectedMember)
      )
        throw new RootSetupError();
    } finally {
      await handle.close();
    }

    await db.tx(async tx => {
      await db.tenants.update(
        tenant.id,
        { provisioned: true, rbac_ready: true },
        { tx }
      );
      await db.cache_revisions.advance(
        [
          { domain: 'tenant', entity: tenant.id },
          { domain: 'tenant', entity: COLLECTION_ENTITY },
        ],
        { tx }
      );
      await db.managed_events.append(
        {
          deduplication_key: randomUUID(),
          event_key: 'tenant.root_setup.completed',
          outcome: 'succeeded',
          tenant_id: tenant.id,
          target_type: 'cell',
          target_id: cellId,
          details: {},
        },
        { tx }
      );
      await markRootSetup(db, cellId, null, tx);
    });
    return 'completed';
  } catch {
    await db
      .tx(tx => markRootSetup(db, cellId, 'ROOT_SETUP_FAILED', tx))
      .catch(() => {});
    throw new RootSetupError();
  }
}

/**
 * Show or clear `ROOT_SETUP_FAILED` on the cell's completed job, so the Cells
 * screen reports a pending root tenant setup (I0003-R025). Touches only a
 * `completed` row; a job still in progress keeps its own failure code.
 * @param {object} db
 * @param {string} cellId
 * @param {string|null} code
 * @param {object} tx
 * @returns {Promise<void>}
 */
async function markRootSetup(db, cellId, code, tx) {
  const job = await db.cell_provisioning.lockByCellId(cellId, { tx });
  if (job?.status !== 'completed' || job.failure_code === code) return;
  await db.cell_provisioning.update(job.id, { failure_code: code }, { tx });
}
