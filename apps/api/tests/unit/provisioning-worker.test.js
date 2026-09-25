/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi } from 'vitest';
import { createProvisioningWorker } from '../../src/application/provisioning/worker.js';

const CELL = '6f1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const OP = '0a1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const STAGES = [
  'registered',
  'setup',
  'migration',
  'seed',
  'activation',
  'complete',
];

/** An in-memory admin DB that honours the M0001-06 domain calls the worker makes. */
function fakeAdmin(job) {
  const row = {
    id: 'job',
    cell_id: CELL,
    operation_id: OP,
    attempts: 0,
    failure_code: null,
    ...job,
  };
  const cell = { id: CELL, database_name: 'nap_dev_cell_a', enabled: false };
  const events = [];
  const models = {
    cell_provisioning: {
      lockNextQueued: vi.fn(async () => (row.status === 'queued' ? row : null)),
      lockByOperationId: vi.fn(async () => row),
      update: vi.fn(async (_id, change) => Object.assign(row, change)),
      requeueRunning: vi.fn(async () => {
        if (row.status === 'running') row.status = 'queued';
      }),
    },
    cells: {
      findOneBy: vi.fn(async () => cell),
      update: vi.fn(async (_id, change) => Object.assign(cell, change)),
    },
    tenants: { lockNapsoft: vi.fn(async () => null) },
    managed_events: { append: vi.fn(async e => events.push(e.event_key)) },
  };
  const db = { ...models, tx: async fn => fn({}) };
  return { admin: { db }, row, cell, events };
}

function stagesRecording(order, overrides = {}) {
  const make = name =>
    overrides[name] ??
    vi.fn(async () => {
      order.push(name);
    });
  return {
    setup: make('setup'),
    migration: make('migration'),
    seed: make('seed'),
    activation: make('activation'),
  };
}

const noRootSetup = vi.fn(async () => 'none');

describe('provisioning worker (I0003-R002–R006)', () => {
  it('runs all four stages in order and completes a provision job', async () => {
    const { admin, row, cell, events } = fakeAdmin({
      requested_action: 'provision',
      stage: 'registered',
      status: 'queued',
    });
    const order = [];
    const worker = createProvisioningWorker({
      admin,
      driver: {},
      stages: stagesRecording(order),
      rootSetup: noRootSetup,
    });
    await worker.tick();
    expect(order).toEqual(['setup', 'migration', 'seed', 'activation']);
    expect(row).toMatchObject({
      stage: 'complete',
      status: 'completed',
      attempts: 0,
    });
    expect(cell.enabled).toBe(true);
    expect(events).toEqual(['cell.provisioning.completed']);
    expect(STAGES).toContain(row.stage);
  });

  it('runs activation only for an activate job (R028)', async () => {
    const { admin, row } = fakeAdmin({
      requested_action: 'activate',
      stage: 'activation',
      status: 'queued',
    });
    const order = [];
    await createProvisioningWorker({
      admin,
      driver: {},
      stages: stagesRecording(order),
      rootSetup: noRootSetup,
    }).tick();
    expect(order).toEqual(['activation']);
    expect(row.status).toBe('completed');
  });

  it('records a failed step with its code and leaves the cell disabled (R034)', async () => {
    const { admin, row, cell } = fakeAdmin({
      requested_action: 'provision',
      stage: 'registered',
      status: 'queued',
    });
    const order = [];
    await createProvisioningWorker({
      admin,
      driver: {},
      stages: stagesRecording(order, {
        migration: async () => {
          throw Object.assign(new Error('x'), { code: 'MIGRATION_FAILED' });
        },
      }),
      rootSetup: noRootSetup,
    }).tick();
    expect(order).toEqual(['setup']);
    expect(row).toMatchObject({
      stage: 'migration',
      status: 'failed',
      failure_code: 'MIGRATION_FAILED',
    });
    expect(cell.enabled).toBe(false);
  });

  it('requeues a running job at start and after stopping mid-job (R002, R005)', async () => {
    const { admin, row } = fakeAdmin({
      requested_action: 'provision',
      stage: 'migration',
      status: 'running',
    });
    let release;
    const gate = new Promise(resolve => (release = resolve));
    const order = [];
    const worker = createProvisioningWorker({
      admin,
      driver: {},
      intervalMs: 5,
      rootSetup: noRootSetup,
      stages: stagesRecording(order, {
        setup: vi.fn(async () => {
          order.push('setup');
          await gate;
        }),
      }),
    });
    await worker.start();
    await vi.waitFor(() => expect(order).toEqual(['setup']));
    const stopping = worker.stop();
    release();
    await stopping;
    expect(order).toEqual(['setup']);
    expect(row.status).toBe('queued');
    expect(admin.db.cell_provisioning.requeueRunning).toHaveBeenCalledTimes(1);
  });

  it('retries root tenant setup on every check and survives its failure (R025)', async () => {
    const { admin } = fakeAdmin({ status: 'completed' });
    const rootSetup = vi.fn(async () => {
      throw new Error('ROOT_SETUP_FAILED');
    });
    const worker = createProvisioningWorker({
      admin,
      driver: {},
      stages: stagesRecording([]),
      rootSetup,
    });
    await worker.tick();
    await worker.tick();
    expect(rootSetup).toHaveBeenCalledTimes(2);
  });
});
