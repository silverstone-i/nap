/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
  assignNapsoftCell,
  runNapsoftTenantSetup,
} from '../../src/application/provisioning/napsoftTenantSetup.js';
import {
  napsoftSeedPresent,
  seedNapsoft,
} from '../../src/modules/access-control/seeds/napsoftSeed.js';

vi.mock('../../src/modules/access-control/seeds/napsoftSeed.js', () => ({
  seedNapsoft: vi.fn(async () => {}),
  napsoftSeedPresent: vi.fn(async () => true),
}));

const CELL = '6f1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const TENANT = '7a1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const LOGIN = '8b1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const MEMBERSHIP = '9c1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';

function fakeAdmin(tenant) {
  const job = { id: 'job', status: 'completed', failure_code: null };
  const events = [];
  const db = {
    job,
    events,
    tenant,
    tx: async fn => fn({}),
    tenants: {
      lockNapsoft: vi.fn(async () => db.tenant),
      findOneBy: vi.fn(async () => db.tenant),
      update: vi.fn(async (id, change) => Object.assign(db.tenant, change)),
      currentSnapshots: vi.fn(async () => []),
    },
    outbox: { enqueueMissing: vi.fn(async () => 0) },
    cache_revisions: { advance: vi.fn(async () => {}) },
    portal_user_tenants: {
      findOneBy: vi.fn(async () => ({
        id: MEMBERSHIP,
        portal_user_id: LOGIN,
        tenant_id: TENANT,
        status: 'active',
        revision: 1,
      })),
      currentSnapshots: vi.fn(async () => []),
    },
    module_entitlements: { currentSnapshots: vi.fn(async () => []) },
    cells: {
      findOneBy: vi.fn(async () => ({ id: CELL, database_name: 'nap_cell' })),
    },
    cell_provisioning: {
      lockByCellId: vi.fn(async () => job),
      update: vi.fn(async (id, change) => Object.assign(job, change)),
    },
    managed_events: { append: vi.fn(async e => events.push(e)) },
  };
  return db;
}

function fakeCell({ corrupt = false } = {}) {
  const rows = { tenants: new Map(), tenant_members: new Map() };
  const model = name => ({
    upsert: vi.fn(async row => rows[name].set(row.id, { ...row })),
    findOneBy: vi.fn(async ({ id }) => {
      const row = rows[name].get(id);
      return corrupt && row ? { ...row, revision: 99 } : (row ?? null);
    }),
  });
  const transactions = [];
  const handle = {
    transactions,
    connect: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    db: {
      tx: async fn => {
        const tx = { id: transactions.length };
        transactions.push(tx);
        return fn(tx);
      },
      tenants: model('tenants'),
      tenant_members: model('tenant_members'),
    },
  };
  return { connect: vi.fn(() => handle), handle, rows };
}

const driver = {
  connection: vi.fn(async () => ({
    endpoint: 'db.example/nap_cell',
    adminPassword: 'admin',
  })),
};

const napsoft = extra => ({
  id: TENANT,
  tenant_code: 'NAPSOFT',
  status: 'active',
  revision: 1,
  cell_id: CELL,
  provisioned: false,
  ...extra,
});

beforeEach(() => {
  vi.mocked(seedNapsoft).mockClear();
  vi.mocked(napsoftSeedPresent).mockReset();
  vi.mocked(napsoftSeedPresent).mockResolvedValue(true);
});

describe('Napsoft tenant setup (I0003-R023–R026)', () => {
  it('assigns the first completed cell and never replaces it (R023)', async () => {
    const db = fakeAdmin(napsoft({ cell_id: null }));
    await assignNapsoftCell(db, {}, { cell_id: CELL });
    expect(db.tenant.cell_id).toBe(CELL);
    await assignNapsoftCell(db, {}, { cell_id: TENANT });
    expect(db.tenant.cell_id).toBe(CELL);
    // I0004-R019: only the first assignment enqueues the tenant's rows.
    expect(db.tenants.currentSnapshots).toHaveBeenCalledTimes(1);
    expect(db.tenants.currentSnapshots.mock.calls[0][0]).toEqual([TENANT]);
  });

  it('writes the cell rows, confirms them, and marks the tenant ready (R024, R026)', async () => {
    const db = fakeAdmin(napsoft());
    const cell = fakeCell();
    expect(
      await runNapsoftTenantSetup(db, driver, { connect: cell.connect })
    ).toBe('completed');
    expect(cell.rows.tenants.get(TENANT)).toEqual({
      id: TENANT,
      tenant_code: 'NAPSOFT',
      status: 'active',
      revision: 1,
    });
    expect(cell.rows.tenant_members.get(MEMBERSHIP)).toMatchObject({
      tenant_id: TENANT,
      portal_user_id: LOGIN,
      member_type: null,
      member_id: null,
    });
    const [writeTx] = cell.handle.transactions;
    expect(cell.handle.db.tenants.upsert.mock.calls[0][3]).toEqual({
      tx: writeTx,
    });
    expect(cell.handle.db.tenant_members.upsert.mock.calls[0][3]).toEqual({
      tx: writeTx,
    });
    expect(seedNapsoft).toHaveBeenCalledWith(cell.handle.db, writeTx, {
      tenantId: TENANT,
      tenantCode: 'NAPSOFT',
      portalUserId: LOGIN,
    });
    expect(
      cell.handle.db.tenant_members.upsert.mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(seedNapsoft).mock.invocationCallOrder[0]);
    expect(napsoftSeedPresent).toHaveBeenCalledWith(
      cell.handle.db,
      cell.handle.transactions[1],
      { tenantId: TENANT, tenantCode: 'NAPSOFT', portalUserId: LOGIN }
    );
    expect(db.tenant).toMatchObject({ provisioned: true, rbac_ready: true });
    expect(db.events.map(e => e.event_key)).toEqual([
      'tenant.napsoft_setup.completed',
    ]);
    expect(cell.handle.close).toHaveBeenCalled();
    expect(
      await runNapsoftTenantSetup(db, driver, { connect: cell.connect })
    ).toBe('none');
  });

  it('leaves the tenant unprovisioned and flags the job when the read-back differs (R025)', async () => {
    const db = fakeAdmin(napsoft());
    const cell = fakeCell({ corrupt: true });
    await expect(
      runNapsoftTenantSetup(db, driver, { connect: cell.connect })
    ).rejects.toThrow('NAPSOFT_SETUP_FAILED');
    expect(db.tenant.provisioned).toBe(false);
    expect(db.job.failure_code).toBe('NAPSOFT_SETUP_FAILED');

    const fixed = fakeCell();
    await runNapsoftTenantSetup(db, driver, { connect: fixed.connect });
    expect(db.tenant.provisioned).toBe(true);
    expect(db.job.failure_code).toBeNull();
  });

  it('fails setup when the seed read-back is missing (R026)', async () => {
    const db = fakeAdmin(napsoft());
    const cell = fakeCell();
    vi.mocked(napsoftSeedPresent).mockResolvedValueOnce(false);
    await expect(
      runNapsoftTenantSetup(db, driver, { connect: cell.connect })
    ).rejects.toThrow('NAPSOFT_SETUP_FAILED');
    expect(seedNapsoft).toHaveBeenCalledTimes(1);
    expect(db.tenant.provisioned).toBe(false);
    expect(db.job.failure_code).toBe('NAPSOFT_SETUP_FAILED');
    expect(db.events).toEqual([]);
  });
});
