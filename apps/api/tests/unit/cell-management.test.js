/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
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
  it('grants access only from the matching capability', () => {
    const actorId = randomUUID();
    expect(
      buildControlAuthority(
        { actorId, platformCapabilities: ['admin-tenancy::control::write'] },
        'admin-tenancy::control::write'
      )
    ).toEqual({ actorId, granted: true, deniedTenantIds: [] });
    expect(
      buildControlAuthority(
        { actorId, platformCapabilities: ['admin-tenancy::control::read'] },
        'admin-tenancy::control::write'
      )
    ).toEqual({ actorId, granted: false, deniedTenantIds: [] });
    expect(
      buildControlAuthority(
        { actorId, platformCapabilities: [] },
        'admin-tenancy::control::write'
      )
    ).toEqual({ actorId, granted: false, deniedTenantIds: [] });
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
      findOneBy: async ({ id }) => ({ id, is_root: id === ROOT_ID }),
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
 * @param {{cells?: object[], operations?: object[], tenants?: object[], root?: boolean}} [options]
 * @returns {{app: import('express').Express, admin: object, cookie: string}}
 */
function api({ cells, operations, tenants, root = true } = {}) {
  const admin = fakeAdmin({ cells, operations, tenants });
  const token = createSessionToken();
  const actorId = root ? ROOT_ID : randomUUID();
  admin.sessionStore.set(hashSessionToken(policy, token), {
    id: randomUUID(),
    portal_user_id: actorId,
    tenant_id: null,
    access_mode: 'normal',
    effective_user_id: null,
    access_reason: null,
    access_expires_at: null,
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
  const app = createApp({
    api: {
      admin,
      environment: 'test',
      sessionPolicy: policy,
      cookiePolicy,
      applicationOrigin: ORIGIN,
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
      },
    ]);

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
});
