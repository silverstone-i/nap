/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createCellDatabase } from '../../infrastructure/runtime/cellDatabase.js';
import { COLLECTION_ENTITY } from '../../modules/admin-tenancy/domain/cache.js';
import {
  customerSeedPresent,
  seedCustomerTenant,
} from '../../modules/access-control/seeds/customerSeed.js';
import { enqueueTenantSnapshots } from '../sync/backfill.js';
import { StageError, stage, withCellAdmin } from './stages.js';

const TENANT_COPY = ['id', 'tenant_code', 'status', 'revision'];
const MEMBER_COPY = [
  'id',
  'tenant_id',
  'portal_user_id',
  'member_type',
  'member_id',
  'status',
  'revision',
];

/**
 * Whether a stored cell row matches the admin values it was written from.
 * @param {object|null} stored
 * @param {object} expected
 * @returns {boolean}
 */
function matches(stored, expected) {
  return Boolean(
    stored &&
    Object.entries(expected).every(
      ([key, value]) => (stored[key] ?? null) === (value ?? null)
    )
  );
}

/**
 * Pick the listed columns from a row.
 * @param {object} row
 * @param {string[]} columns
 * @returns {object}
 */
function pick(row, columns) {
  return Object.fromEntries(columns.map(column => [column, row[column]]));
}

/**
 * Build the tenant provisioning stages (I0006-R006–R008). Each stage reruns
 * safely, so retry after a failure never duplicates rows (I0006-R009).
 * @param {{admin: {db: object}, driver: {connection: Function}, registry: {readiness: (id: string) => {ready: boolean}}, connect?: typeof createCellDatabase}} context
 * @returns {{assignment: (job: object) => Promise<void>, seed: (job: object) => Promise<void>, activation: (job: object) => Promise<void>, activate: (tx: object, job: object) => Promise<void>}}
 */
export function createTenantStages({
  admin,
  driver,
  registry,
  connect = createCellDatabase,
}) {
  const db = admin.db;

  /** Throw `CELL_UNAVAILABLE` unless the job's cell is ready. */
  function requireReady(job) {
    if (!registry.readiness(job.cell_id)?.ready)
      throw new StageError('CELL_UNAVAILABLE');
  }

  /**
   * Assignment (I0006-R006): give the tenant its cell and enqueue its synced
   * rows for that cell, in one admin transaction. The cell never changes
   * once set (I0006-R014).
   */
  async function assignment(job) {
    return stage('CELL_UNAVAILABLE', async () => {
      requireReady(job);
      await db.tx(async tx => {
        const tenant = await db.tenants.lockById(job.tenant_id, { tx });
        if (!tenant) throw new StageError('CELL_UNAVAILABLE');
        if (tenant.cell_id && tenant.cell_id !== job.cell_id)
          throw new StageError('CELL_UNAVAILABLE');
        if (!tenant.cell_id)
          await db.tenants.update(tenant.id, { cell_id: job.cell_id }, { tx });
        await enqueueTenantSnapshots(db, { tx, tenantIds: [tenant.id] });
        await db.cache_revisions.advance(
          [
            { domain: 'tenant', entity: tenant.id },
            { domain: 'tenant', entity: COLLECTION_ENTITY },
          ],
          { tx }
        );
      });
    });
  }

  /**
   * Seed (I0006-R007): write the tenant and the first administrator's
   * membership into the cell with admin's current revisions, run the
   * customer-tenant seed, then read everything back.
   */
  async function seed(job) {
    return stage('SEED_FAILED', async () => {
      requireReady(job);
      const tenant = await db.tenants.findOneBy(
        { id: job.tenant_id },
        { columnWhitelist: TENANT_COPY }
      );
      const membership = await db.portal_user_tenants.findOneBy(
        { id: job.admin_membership_id },
        { columnWhitelist: MEMBER_COPY }
      );
      const cell = await db.cells.findOneBy(
        { id: job.cell_id },
        { columnWhitelist: ['id', 'database_name'] }
      );
      if (!tenant || !membership || !cell) throw new StageError('SEED_FAILED');
      const expectedTenant = pick(tenant, TENANT_COPY);
      const expectedMember = pick(membership, MEMBER_COPY);
      const seedInput = {
        tenantId: tenant.id,
        tenantCode: tenant.tenant_code,
        portalUserId: membership.portal_user_id,
      };
      const target = await driver.connection({ cell });
      await withCellAdmin(
        target,
        async handle => {
          await handle.db.tx(async tx => {
            await handle.db.tenants.upsert(expectedTenant, ['id'], null, {
              tx,
            });
            await handle.db.tenant_members.upsert(
              expectedMember,
              ['id'],
              null,
              { tx }
            );
            await seedCustomerTenant(handle.db, tx, seedInput);
          });
          const seeded = await handle.db.tx(tx =>
            customerSeedPresent(handle.db, tx, seedInput)
          );
          const [storedTenant, storedMember] = await Promise.all([
            handle.db.tenants.findOneBy(
              { id: tenant.id },
              { columnWhitelist: TENANT_COPY }
            ),
            handle.db.tenant_members.findOneBy(
              { id: membership.id },
              { columnWhitelist: MEMBER_COPY }
            ),
          ]);
          if (
            !seeded ||
            !matches(storedTenant, expectedTenant) ||
            !matches(storedMember, expectedMember)
          )
            throw new StageError('SEED_FAILED');
        },
        connect
      );
    });
  }

  /** Activation's check before the completing transaction runs. */
  async function activation(job) {
    return stage('ACTIVATION_FAILED', async () => requireReady(job));
  }

  /**
   * Activation's writes (I0006-R008), run inside the transaction that
   * completes the job: the tenant becomes active, provisioned, and
   * RBAC-ready, and the first administrator's membership active and ready.
   * @param {object} tx
   * @param {object} job
   * @returns {Promise<void>}
   */
  async function activate(tx, job) {
    await db.tenants.update(
      job.tenant_id,
      { status: 'active', provisioned: true, rbac_ready: true },
      { tx }
    );
    await db.portal_user_tenants.update(
      job.admin_membership_id,
      { status: 'active', ready: true },
      { tx }
    );
    await db.cache_revisions.advance(
      [{ domain: 'membership', entity: job.admin_membership_id }],
      { tx }
    );
  }

  return { assignment, seed, activation, activate };
}
