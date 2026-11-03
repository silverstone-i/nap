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
import {
  directorySeedPresent,
  seedDirectoryTenant,
} from '../../modules/business-directory/seeds/tenantSeed.js';
import {
  seedTenantSettings,
  tenantSettingsPresent,
} from '../../modules/tenant-settings/seeds/tenantSeed.js';
import { enqueueTenantSnapshots } from '../sync/backfill.js';
import { StageError, stage, withCellAdmin } from './stages.js';

const TENANT_COPY = [
  'id',
  'tenant_code',
  'status',
  'name',
  'legal_name',
  'dba_name',
  'revision',
];
const MEMBER_COPY = [
  'id',
  'tenant_id',
  'portal_user_id',
  'member_type',
  'member_id',
  'member_label',
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
 * Whether the cell's tenant copy is the expected one or a newer revision the
 * sync delivered meanwhile, such as a Napsoft rename (I0013-R006).
 * @param {object|null} stored
 * @param {object} expected
 * @returns {boolean}
 */
function currentTenant(stored, expected) {
  return Boolean(
    stored &&
    stored.id === expected.id &&
    (stored.revision > expected.revision || matches(stored, expected))
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
 * @returns {{client: (job: object) => Promise<void>, assignment: (job: object) => Promise<void>, seed: (job: object) => Promise<void>, activation: (job: object) => Promise<void>, activate: (tx: object, job: object) => Promise<void>}}
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
   * Client (I0013-R003): create the tenant's Napsoft client, with no tax
   * ID, in the Napsoft cell under the ID provisioning generated, with its
   * head office as its default location and bill-to (I0014-R024), then read
   * it back. Reruns find the rows and add nothing.
   */
  async function client(job) {
    return stage('SEED_FAILED', async () => {
      const tenant = await db.tenants.findOneBy(
        { id: job.tenant_id },
        { columnWhitelist: ['client_id', 'legal_name', 'dba_name'] }
      );
      const napsoft = await db.tenants.findOneBy(
        { is_napsoft: true },
        { columnWhitelist: ['id', 'cell_id'] }
      );
      if (!napsoft?.cell_id || !registry.readiness(napsoft.cell_id)?.ready)
        throw new StageError('CELL_UNAVAILABLE');
      if (!tenant?.client_id) throw new StageError('SEED_FAILED');
      const cell = await db.cells.findOneBy(
        { id: napsoft.cell_id },
        { columnWhitelist: ['id', 'database_name'] }
      );
      if (!cell) throw new StageError('CELL_UNAVAILABLE');
      const expected = {
        party_id: tenant.client_id,
        tenant_id: napsoft.id,
        legal_name: tenant.legal_name,
        dba_name: tenant.dba_name ?? null,
      };
      const target = await driver.connection({ cell });
      await withCellAdmin(
        target,
        async handle => {
          await handle.db.tx(async tx => {
            if (!(await handle.db.parties.byKey(expected.party_id, { tx })))
              await handle.db.parties.insertWithId(
                {
                  id: expected.party_id,
                  tenant_id: napsoft.id,
                  kind: 'client',
                },
                { tx }
              );
            if (
              !(await handle.db.organizations.byKey(expected.party_id, { tx }))
            )
              await handle.db.organizations.insert(expected, { tx });
            const addresses = await handle.db.addresses.rows(
              { party_id: expected.party_id },
              { tx, includeArchived: true }
            );
            if (addresses.length === 0) {
              const address = await handle.db.addresses.insert(
                {
                  ...job.client_address,
                  tenant_id: napsoft.id,
                  party_id: expected.party_id,
                  is_primary: true,
                },
                { tx }
              );
              for (const purpose of ['location', 'bill_to'])
                await handle.db.address_purposes.insert(
                  {
                    tenant_id: napsoft.id,
                    address_id: address.id,
                    party_id: expected.party_id,
                    purpose,
                    is_default: true,
                    delivery_method: purpose === 'bill_to' ? 'email' : null,
                  },
                  { tx }
                );
            }
          });
          const [party, organization] = await handle.db.tx(tx =>
            Promise.all([
              handle.db.parties.byKey(expected.party_id, { tx }),
              handle.db.organizations.byKey(expected.party_id, { tx }),
            ])
          );
          // `nap-admin` is not filtered by row-level security: the rows
          // must be Napsoft's client. Names are not compared: Napsoft may
          // rename the client before a retry (I0013-R006).
          if (
            party?.tenant_id !== napsoft.id ||
            party.kind !== 'client' ||
            organization?.tenant_id !== napsoft.id
          )
            throw new StageError('SEED_FAILED');
        },
        connect
      );
    });
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
   * Seed (I0006-R007, M0005-R022): write the tenant and the first
   * administrator's membership into the cell with admin's current
   * revisions, run the customer-tenant role seed and the directory seed,
   * then read everything back.
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
      const login = membership
        ? await db.portal_users.findOneBy(
            { id: membership.portal_user_id },
            { columnWhitelist: ['email'] }
          )
        : null;
      if (!tenant || !membership?.member_id || !cell || !login)
        throw new StageError('SEED_FAILED');
      const expectedTenant = pick(tenant, TENANT_COPY);
      const expectedMember = pick(membership, MEMBER_COPY);
      const seedInput = {
        tenantId: tenant.id,
        tenantCode: tenant.tenant_code,
        membershipId: membership.id,
      };
      // M0005-R022: the first administrator's employee record.
      const directoryInput = {
        tenantId: tenant.id,
        partyId: membership.member_id,
        firstName: job.admin_first_name,
        lastName: job.admin_last_name,
        email: login.email,
        phone: job.admin_phone,
      };
      const target = await driver.connection({ cell });
      await withCellAdmin(
        target,
        async handle => {
          await handle.db.tx(async tx => {
            // Never replace a newer copy the sync already delivered.
            const held = await handle.db.tenants.findOneBy(
              { id: tenant.id },
              { columnWhitelist: ['revision'], tx }
            );
            if (!held || held.revision < expectedTenant.revision)
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
            await seedDirectoryTenant(handle.db, tx, directoryInput);
            // M0006-01-R009: every setting starts at its default.
            await seedTenantSettings(handle.db, tx, tenant.id);
          });
          const seeded = await handle.db.tx(
            async tx =>
              (await customerSeedPresent(handle.db, tx, seedInput)) &&
              (await directorySeedPresent(handle.db, tx, directoryInput)) &&
              (await tenantSettingsPresent(handle.db, tx, tenant.id))
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
            !currentTenant(storedTenant, expectedTenant) ||
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

  return { client, assignment, seed, activation, activate };
}
