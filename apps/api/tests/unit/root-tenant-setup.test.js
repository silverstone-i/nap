/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi } from 'vitest';
import {
  assignNapsoftCell,
  runRootTenantSetup,
} from '../../src/application/provisioning/rootTenantSetup.js';

const CELL = '6f1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const TENANT = '7a1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const ROOT = '8b1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
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
    portal_users: { findOneBy: vi.fn(async () => ({ id: ROOT })) },
    portal_user_tenants: {
      findOneBy: vi.fn(async () => ({
        id: MEMBERSHIP,
        portal_user_id: ROOT,
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
  const handle = {
    connect: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    db: {
      tx: async fn => fn({}),
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

describe('root tenant setup (I0003-R023–R026)', () => {
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
      await runRootTenantSetup(db, driver, { connect: cell.connect })
    ).toBe('completed');
    expect(cell.rows.tenants.get(TENANT)).toEqual({
      id: TENANT,
      tenant_code: 'NAPSOFT',
      status: 'active',
      revision: 1,
    });
    expect(cell.rows.tenant_members.get(MEMBERSHIP)).toMatchObject({
      tenant_id: TENANT,
      portal_user_id: ROOT,
      member_type: null,
      member_id: null,
    });
    expect(db.tenant).toMatchObject({ provisioned: true, rbac_ready: true });
    expect(db.events.map(e => e.event_key)).toEqual([
      'tenant.root_setup.completed',
    ]);
    expect(cell.handle.close).toHaveBeenCalled();
    expect(
      await runRootTenantSetup(db, driver, { connect: cell.connect })
    ).toBe('none');
  });

  it('leaves the tenant unprovisioned and flags the job when the read-back differs (R025)', async () => {
    const db = fakeAdmin(napsoft());
    const cell = fakeCell({ corrupt: true });
    await expect(
      runRootTenantSetup(db, driver, { connect: cell.connect })
    ).rejects.toThrow('ROOT_SETUP_FAILED');
    expect(db.tenant.provisioned).toBe(false);
    expect(db.job.failure_code).toBe('ROOT_SETUP_FAILED');

    const fixed = fakeCell();
    await runRootTenantSetup(db, driver, { connect: fixed.connect });
    expect(db.tenant.provisioned).toBe(true);
    expect(db.job.failure_code).toBeNull();
  });
});
