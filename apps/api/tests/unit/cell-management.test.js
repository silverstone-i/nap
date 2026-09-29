/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { authorizeActor } from './helpers/authorization.js';
import { ERROR_STATUS } from '../../src/framework/envelope.js';
import { adminTenancyRoutesV1 } from '../../src/modules/admin-tenancy/apiRoutes/v1/index.js';
import {
  createSessionToken,
  hashSessionToken,
} from '../../src/modules/admin-tenancy/domain/session.js';
import {
  buildControlAuthority,
  databaseName,
  parseEnvironment,
  parseSuffix,
} from '../../src/modules/admin-tenancy/domain/cells.js';

const ORIGIN = 'http://localhost:5173';
const policy = {
  secret: 'unit-test-session-secret-of-ample-length',
  idleMinutes: 30,
  absoluteHours: 12,
};
const cookiePolicy = { secure: false, sameSite: 'lax' };

describe('validation', () => {
  it('accepts a well-formed suffix and rejects the rest', () => {
    for (const good of ['a', '1', 'east', 'us-east-1', '1east', 'a'.repeat(32)])
      expect(parseSuffix(good)).toBe(good);
    for (const bad of ['', 'A', '-east', 'east-', 'a'.repeat(33), 'has space'])
      expect(() => parseSuffix(bad)).toThrow(
        expect.objectContaining({ code: 'INVALID_INPUT' })
      );
  });

  it('accepts only the three configured environments', () => {
    for (const good of ['dev', 'test', 'prod'])
      expect(parseEnvironment(good)).toBe(good);
    for (const bad of ['staging', 'PROD', '', undefined])
      expect(() => parseEnvironment(bad)).toThrow(
        expect.objectContaining({ code: 'INVALID_INPUT' })
      );
  });

  it('derives the database name and enforces the 63-byte identifier limit', () => {
    expect(databaseName('dev', 'east')).toBe('nap_dev_cell_east');
    expect(databaseName('prod', 'a'.repeat(32)).length).toBeLessThanOrEqual(63);
  });
});

describe('control authority', () => {
  it('grants access only from a permitted decision', () => {
    const actorId = randomUUID();
    expect(buildControlAuthority({ actorId, decision: 'permit' })).toEqual({
      actorId,
      granted: true,
    });
    expect(buildControlAuthority({ actorId, decision: 'deny' })).toEqual({
      actorId,
      granted: false,
    });
  });
});

/**
 * Build a cell row shaped like `Cells`' safe view.
 * @param {object} [overrides]
 * @returns {object}
 */
function cellRow(overrides = {}) {
  const created = new Date();
  return {
    id: randomUUID(),
    environment: 'test',
    database_name: `nap_test_cell_${randomUUID().slice(0, 8)}`,
    enabled: false,
    created_at: created,
    created_by: null,
    updated_at: created,
    updated_by: null,
    deactivated_at: null,
    ...overrides,
  };
}

/**
 * Build an operation row shaped like `CellProvisioning`'s safe view.
 * @param {string} cellId
 * @param {object} [overrides]
 * @returns {object}
 */
function operationRow(cellId, overrides = {}) {
  const created = new Date();
  return {
    id: randomUUID(),
    cell_id: cellId,
    operation_id: randomUUID(),
    requested_action: 'provision',
    stage: 'registered',
    status: 'queued',
    attempts: 0,
    failure_code: null,
    started_at: null,
    completed_at: null,
    created_at: created,
    updated_at: created,
    ...overrides,
  };
}

/**
 * Build an in-memory admin handle exercising only the HTTP layer: session
 * resolution, capability gating, and the shape of a cell/operation row
 * through each route. Business-rule behavior (transitions, locking,
 * concurrency, Napsoft denial) is verified against real PostgreSQL in the
 * integration test.
 * @param {{cells?: object[], operations?: object[], tenants?: object[]}} seed
 * @returns {{db: object, events: object[]}}
 */
function fakeAdmin({ cells = [], operations = [], tenants = [] } = {}) {
  const events = [];
  const sessionStore = new Map();
  const cellStore = new Map(cells.map(row => [row.id, { ...row }]));
  const opStore = new Map(operations.map(row => [row.id, { ...row }]));
  const db = {
    // `one` fakes the advisory-lock statement `registerCell` issues directly
    // against the transaction handle.
    tx: operation => operation({ one: async () => ({}) }),
    portal_users: {
      findOneBy: async ({ id }) => ({ id }),
    },
    sessions: {
      findByTokenHash: async hash => {
        const found = sessionStore.get(hash);
        return found ? { ...found } : null;
      },
      touch: async () => null,
    },
    tenants: {
      findWhere: async ({ cell_id: cellId, id: { $in: ids } }) =>
        tenants.filter(t => t.cell_id === cellId && ids.includes(t.id)),
    },
    cells: {
      findActiveByIdentity: async (environment, database_name) =>
        [...cellStore.values()].find(
          row =>
            row.environment === environment &&
            row.database_name === database_name &&
            row.deactivated_at === null
        ) ?? null,
      insert: async dto => {
        const row = cellRow({ ...dto });
        cellStore.set(row.id, row);
        return row;
      },
      update: async (id, dto) => {
        const found = cellStore.get(id);
        if (!found) return null;
        Object.assign(found, dto);
        return { ...found };
      },
      findOneBy: async ({ id }) => {
        const found = cellStore.get(id);
        return found ? { ...found } : null;
      },
      findAfterCursor: async (cursor, limit) => {
        const rows = [...cellStore.values()]
          .sort((a, b) => (a.id < b.id ? -1 : 1))
          .filter(row => !cursor?.id || row.id > cursor.id);
        const page = rows.slice(0, limit);
        return {
          rows: page,
          nextCursor: rows.length > limit ? { id: page.at(-1).id } : null,
        };
      },
    },
    cell_provisioning: {
      insert: async dto => {
        const row = operationRow(dto.cell_id, { ...dto });
        opStore.set(row.id, row);
        return row;
      },
      lockByCellId: async cellId =>
        [...opStore.values()].find(row => row.cell_id === cellId) ?? null,
      lockByOperationId: async operationId =>
        [...opStore.values()].find(row => row.operation_id === operationId) ??
        null,
      update: async (id, dto) => {
        const found = opStore.get(id);
        if (!found) return null;
        Object.assign(found, dto);
        return { ...found };
      },
      findOneBy: async ({ cell_id: cellId }) => {
        const found = [...opStore.values()].find(row => row.cell_id === cellId);
        return found ? { ...found } : null;
      },
      findWhere: async ({ cell_id: { $in: ids } }) =>
        [...opStore.values()].filter(row => ids.includes(row.cell_id)),
      listStates: async () => [...opStore.values()].map(row => ({ ...row })),
      hasActive: async () =>
        [...opStore.values()].some(row =>
          ['queued', 'running'].includes(row.status)
        ),
    },
    managed_events: {
      append: async event => {
        events.push(event);
        return event;
      },
    },
  };
  return { db, events, sessionStore };
}

const ROOT_ID = randomUUID();

/**
 * Build the API with a fake admin handle and the real route table, and a
 * live session cookie for a root or ordinary actor.
 * @param {{cells?: object[], operations?: object[], tenants?: object[], root?: boolean, runtime?: object}} [options]
 * @returns {{app: import('express').Express, admin: object, cookie: string}}
 */
function api({ cells, operations, tenants, root = true, runtime } = {}) {
  const admin = fakeAdmin({ cells, operations, tenants });
  const token = createSessionToken();
  const actorId = root ? ROOT_ID : randomUUID();
  admin.sessionStore.set(hashSessionToken(policy, token), {
    id: randomUUID(),
    portal_user_id: actorId,
    tenant_id: null,
    last_seen_at: new Date(),
    idle_expires_at: new Date(Date.now() + 30 * 60_000),
    absolute_expires_at: new Date(Date.now() + 12 * 3_600_000),
    created_at: new Date(),
    updated_at: new Date(),
    deactivated_at: null,
    user_status: 'active',
    must_change_password: false,
    user_archived: false,
    expired: false,
    stale: false,
  });
  const cache = authorizeActor(admin.db, ROOT_ID);
  const app = createApp({
    api: {
      admin,
      cache,
      environment: 'test',
      sessionPolicy: policy,
      cookiePolicy,
      applicationOrigin: ORIGIN,
      runtime,
      registrations: adminTenancyRoutesV1,
    },
  });
  return { app, admin, cookie: `nap_session=${token}` };
}

describe('control routes', () => {
  it('requires a session on every route', async () => {
    const { app } = api();
    for (const call of [
      request(app)
        .post('/api/admin-tenancy/v1/control/registry')
        .set('Origin', ORIGIN)
        .send({ operation: 'cell', suffix: 'east' }),
      request(app).get('/api/admin-tenancy/v1/control/overview'),
    ])
      expect((await call).status).toBe(ERROR_STATUS.UNAUTHENTICATED);
  });

  it('refuses a session with no control capability', async () => {
    const { app, cookie } = api({ root: false });
    const response = await request(app)
      .post('/api/admin-tenancy/v1/control/registry')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ operation: 'cell', suffix: 'east' });
    expect(response.status).toBe(ERROR_STATUS.FORBIDDEN);
  });

  it('rejects a malformed registration body', async () => {
    const { app, cookie } = api();
    const response = await request(app)
      .post('/api/admin-tenancy/v1/control/registry')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ operation: 'cell', suffix: 'NOT-LOWERCASE' });
    expect(response.status).toBe(ERROR_STATUS.INVALID_INPUT);
  });

  it('registers a cell and returns its cell and operation', async () => {
    const { app, cookie } = api();
    const response = await request(app)
      .post('/api/admin-tenancy/v1/control/registry')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ operation: 'cell', suffix: 'east' });
    expect(response.status).toBe(201);
    expect(response.body.data.cell.database_name).toBe('nap_test_cell_east');
    expect(response.body.data.cell.enabled).toBe(false);
    expect(response.body.data.operation.stage).toBe('registered');
    expect(response.body.data.operation.status).toBe('queued');
  });

  it('reports a duplicate identity as a conflict', async () => {
    const existing = cellRow({
      environment: 'test',
      database_name: 'nap_test_cell_east',
    });
    const { app, cookie } = api({ cells: [existing] });
    const response = await request(app)
      .post('/api/admin-tenancy/v1/control/registry')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ operation: 'cell', suffix: 'east' });
    expect(response.status).toBe(ERROR_STATUS.CONFLICT);
  });

  it('retries a failed operation and disables a cell', async () => {
    const cell = cellRow({ enabled: true });
    const failed = operationRow(cell.id, {
      status: 'failed',
      attempts: 1,
      failure_code: 'SETUP_TIMEOUT',
    });
    const { app, cookie } = api({ cells: [cell], operations: [failed] });

    const retried = await request(app)
      .post('/api/admin-tenancy/v1/control/provision')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ operation: 'cell-retry', cell: cell.id });
    expect(retried.status).toBe(200);
    expect(retried.body.data.status).toBe('queued');
    expect(retried.body.data.attempts).toBe(2);

    const disabled = await request(app)
      .post('/api/admin-tenancy/v1/control/provision')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ operation: 'cell-disable', cell: cell.id });
    expect(disabled.status).toBe(200);
    expect(disabled.body.data.enabled).toBe(false);
  });

  it('queues activation for a disabled, completed cell only (I0003-R027, AC09)', async () => {
    const cell = cellRow({ enabled: false });
    const completed = operationRow(cell.id, {
      stage: 'complete',
      status: 'completed',
    });
    const runtime = {
      readiness: vi.fn(() => ({ ready: false, reason: 'CELL_DISABLED' })),
      markDisabled: vi.fn(),
    };
    const { app, admin, cookie } = api({
      cells: [cell],
      operations: [completed],
      runtime,
    });
    const send = body =>
      request(app)
        .post('/api/admin-tenancy/v1/control/provision')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send(body);

    const activated = await send({ operation: 'cell-activate', cell: cell.id });
    expect(activated.status).toBe(200);
    expect(activated.body.data).toMatchObject({
      requested_action: 'activate',
      stage: 'activation',
      status: 'queued',
    });
    expect(admin.events.map(e => e.event_key)).toContain(
      'cell.activate.requested'
    );
    const again = await send({ operation: 'cell-activate', cell: cell.id });
    expect(again.status).toBe(ERROR_STATUS.INVALID_STATE);

    await send({ operation: 'cell-disable', cell: cell.id });
    expect(runtime.markDisabled).toHaveBeenCalledWith(cell.id);

    const readiness = await request(app)
      .get('/api/admin-tenancy/v1/control/cell-readiness')
      .query({ cell: cell.id })
      .set('Cookie', cookie);
    expect(JSON.stringify(readiness.body)).toContain('CELL_DISABLED');
  });

  it('refuses to retry a completed operation', async () => {
    const cell = cellRow({ enabled: true });
    const completed = operationRow(cell.id, {
      stage: 'complete',
      status: 'completed',
    });
    const { app, cookie } = api({ cells: [cell], operations: [completed] });
    const response = await request(app)
      .post('/api/admin-tenancy/v1/control/provision')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ operation: 'cell-retry', cell: cell.id });
    expect(response.status).toBe(ERROR_STATUS.INVALID_STATE);
    expect(response.body.error.code).toBe('INVALID_STATE');
  });

  it('reads the overview and one cell readiness', async () => {
    const cell = cellRow();
    const operation = operationRow(cell.id);
    const { app, cookie } = api({ cells: [cell], operations: [operation] });

    const overview = await request(app)
      .get('/api/admin-tenancy/v1/control/overview')
      .set('Cookie', cookie);
    expect(overview.status).toBe(200);
    expect(overview.body.data.rows).toEqual([
      {
        cell: expect.objectContaining({ id: cell.id }),
        operation: expect.objectContaining({ id: operation.id }),
        ready: false,
        seedState: 'unknown',
      },
    ]);
    expect(overview.body.data.anyActive).toBe(true);

    const readiness = await request(app)
      .get(`/api/admin-tenancy/v1/control/cell-readiness?cell=${cell.id}`)
      .set('Cookie', cookie);
    expect(readiness.status).toBe(200);
    expect(readiness.body.data.runtime).toEqual({
      ready: false,
      checked: false,
    });

    const missing = await request(app)
      .get(`/api/admin-tenancy/v1/control/cell-readiness?cell=${randomUUID()}`)
      .set('Cookie', cookie);
    expect(missing.status).toBe(ERROR_STATUS.NOT_FOUND);
  });

  describe('reference-data rollout (I0007)', () => {
    /**
     * A registry fake reporting `SEED_MISSING` for the given cells and
     * ready for the rest.
     * @param {string[]} missing
     * @returns {{seedVersion: number, readiness: Function}}
     */
    const runtimeFor = missing => ({
      seedVersion: 2,
      readiness: id =>
        missing.includes(id)
          ? { ready: false, reason: 'SEED_MISSING' }
          : { ready: true },
    });
    const completed = cellId =>
      operationRow(cellId, { stage: 'complete', status: 'completed' });
    const post = (app, cookie, body) =>
      request(app)
        .post('/api/admin-tenancy/v1/control/provision')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send(body);

    it('queues a seed job for an eligible cell and records an event', async () => {
      const cell = cellRow({ enabled: true });
      const { app, admin, cookie } = api({
        cells: [cell],
        operations: [completed(cell.id)],
        runtime: runtimeFor([cell.id]),
      });
      const response = await post(app, cookie, {
        operation: 'cell-seed',
        cell: cell.id,
      });
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        requested_action: 'seed',
        stage: 'seed',
        status: 'queued',
      });
      expect(admin.events).toContainEqual(
        expect.objectContaining({
          event_key: 'cell.seed.requested',
          target_id: cell.id,
          details: { seed_version: 2 },
        })
      );
    });

    it('refuses a ready cell and returns an already queued job unchanged', async () => {
      const ready = cellRow({ enabled: true });
      const busy = cellRow({ enabled: true });
      const busyJob = operationRow(busy.id, {
        requested_action: 'seed',
        stage: 'seed',
        status: 'running',
      });
      const { app, cookie } = api({
        cells: [ready, busy],
        operations: [completed(ready.id), busyJob],
        runtime: runtimeFor([busy.id]),
      });
      const refused = await post(app, cookie, {
        operation: 'cell-seed',
        cell: ready.id,
      });
      expect(refused.status).toBe(ERROR_STATUS.INVALID_STATE);
      const unchanged = await post(app, cookie, {
        operation: 'cell-seed',
        cell: busy.id,
      });
      expect(unchanged.status).toBe(200);
      expect(unchanged.body.data).toMatchObject({
        id: busyJob.id,
        status: 'running',
      });
    });

    it('rolls out to every eligible cell and skips queued ones', async () => {
      const a = cellRow({ enabled: true });
      const b = cellRow({ enabled: true });
      const ready = cellRow({ enabled: true });
      const { app, admin, cookie } = api({
        cells: [a, b, ready],
        operations: [completed(a.id), completed(b.id), completed(ready.id)],
        runtime: runtimeFor([a.id, b.id]),
      });
      const first = await post(app, cookie, { operation: 'reference-rollout' });
      expect(first.status).toBe(200);
      expect(first.body.data.declaredVersion).toBe(2);
      expect(first.body.data.queued.sort()).toEqual([a.id, b.id].sort());
      expect(first.body.data.skipped).toEqual([]);
      expect(admin.events).toContainEqual(
        expect.objectContaining({
          event_key: 'reference.rollout.requested',
          details: { seed_version: 2, queued: 2, skipped: 0 },
        })
      );

      const second = await post(app, cookie, {
        operation: 'reference-rollout',
      });
      expect(second.body.data.queued).toEqual([]);
      expect(second.body.data.skipped).toEqual(
        expect.arrayContaining([
          { cell: a.id, reason: 'ALREADY_QUEUED' },
          { cell: b.id, reason: 'ALREADY_QUEUED' },
        ])
      );
    });

    it('reports seed state and counts in the overview', async () => {
      const missing = cellRow({ enabled: true });
      const ready = cellRow({ enabled: true });
      const failed = cellRow();
      const { app, cookie } = api({
        cells: [missing, ready, failed],
        operations: [
          completed(missing.id),
          completed(ready.id),
          operationRow(failed.id, {
            requested_action: 'seed',
            stage: 'seed',
            status: 'failed',
            failure_code: 'SEED_FAILED',
          }),
        ],
        runtime: runtimeFor([missing.id, failed.id]),
      });
      const overview = await request(app)
        .get('/api/admin-tenancy/v1/control/overview')
        .set('Cookie', cookie);
      expect(overview.status).toBe(200);
      expect(overview.body.data.referenceSeed).toEqual({
        declaredVersion: 2,
        current: 1,
        missing: 1,
        queued: 0,
        running: 0,
        failed: 1,
      });
      const states = Object.fromEntries(
        overview.body.data.rows.map(row => [row.cell.id, row.seedState])
      );
      expect(states).toEqual({
        [missing.id]: 'missing',
        [ready.id]: 'current',
        [failed.id]: 'failed',
      });
    });

    it('denies both operations without control write', async () => {
      const { app, cookie } = api({ root: false, runtime: runtimeFor([]) });
      for (const body of [
        { operation: 'cell-seed', cell: randomUUID() },
        { operation: 'reference-rollout' },
      ])
        expect((await post(app, cookie, body)).status).toBe(
          ERROR_STATUS.FORBIDDEN
        );
    });
  });
});
