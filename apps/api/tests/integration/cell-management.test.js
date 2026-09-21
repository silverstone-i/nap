/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createAdminDatabase,
  using,
} from '../../src/infrastructure/runtime/adminDatabase.js';
import { setupLocal } from '../../src/infrastructure/provisioning/postgres.js';
import { migrateAdmin } from '../../src/application/maintenance/migrateAdmin.js';
import { roleUrl } from '../../src/application/shared/configuration.js';
import {
  advanceCellProvisioning,
  disableCell,
  executeProvisionCommand,
  getCellReadiness,
  getOverview,
  registerCell,
  retryCellProvisioning,
} from '../../src/modules/admin-tenancy/domain/cells.js';

const fixture = process.env.FOUNDATION_TEST_URL;
if (!fixture)
  throw new Error(
    'FOUNDATION_TEST_URL must identify a disposable PostgreSQL 18 server'
  );
const url = new URL(fixture);
const name = 'nap_test_' + randomUUID().replaceAll('-', '');
const config = {
  database: name,
  environment: 'test',
  endpoint: url.host + '/' + name,
  maintenance: url.host + '/postgres',
  adminPassword: 'foundation-admin',
  appPassword: 'foundation-app',
};
let handle, db;

/**
 * Build a write authority for a root-equivalent operator.
 * @param {string[]} [deniedTenantIds]
 * @returns {{actorId: string, granted: boolean, deniedTenantIds: string[]}}
 */
function authority(deniedTenantIds = []) {
  return { actorId: randomUUID(), granted: true, deniedTenantIds };
}

/**
 * Register a cell and return its cell view.
 * @param {string} [suffix]
 * @returns {Promise<{cell: object, operation: object}>}
 */
function register(
  suffix = 's' + randomUUID().replaceAll('-', '').slice(0, 12)
) {
  return registerCell(db, 'test', authority(), {
    operation: 'cell',
    suffix,
  });
}

/**
 * Insert an active ordinary tenant, optionally assigned to a cell.
 * @param {{cellId?: string, napsoft?: boolean}} [options]
 * @returns {Promise<string>} The tenant UUID.
 */
async function tenant({ cellId = null, napsoft = false } = {}) {
  const row = await db.one(
    `INSERT INTO admin.tenants(tenant_code,name,status,is_napsoft,cell_id)
     VALUES($1,'Tenant','active',$2,$3) RETURNING id`,
    ['T-' + randomUUID().slice(0, 8), napsoft, cellId]
  );
  return row.id;
}

/**
 * The owning tenant. A partial unique index permits exactly one row with
 * `is_napsoft`, so every test that needs a fresh one clears it first.
 * @param {string|null} cellId
 * @returns {Promise<string>} The Napsoft tenant UUID.
 */
async function napsoftTenant(cellId) {
  await db.none('DELETE FROM admin.tenants WHERE is_napsoft');
  return tenant({ cellId, napsoft: true });
}

/**
 * Read the events recorded for a cell, oldest first.
 * @param {string} cellId
 * @returns {Promise<object[]>}
 */
function eventsFor(cellId) {
  return db.any(
    "SELECT event_key,outcome,details FROM admin.managed_events WHERE target_type='cell' AND target_id=$1 ORDER BY occurred_at,id",
    [cellId]
  );
}

beforeAll(async () => {
  await using(fixture, async tx => {
    for (const [role, password, attrs] of [
      ['nap-admin', config.adminPassword, 'CREATEDB CREATEROLE'],
      ['nap-app', config.appPassword, 'NOCREATEDB NOCREATEROLE'],
    ]) {
      if (
        !(await tx.oneOrNone('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]))
      )
        await tx.none(
          `CREATE ROLE $1:name LOGIN NOSUPERUSER NOBYPASSRLS ${attrs} PASSWORD $2`,
          [role, password]
        );
    }
  });
  await setupLocal(config);
  await migrateAdmin(config);
  handle = createAdminDatabase(
    roleUrl(config.endpoint, 'nap-app', config.appPassword)
  );
  await handle.connect();
  db = handle.db;
}, 30000);
afterAll(async () => {
  await handle?.close();
  await using(fixture, tx =>
    tx.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [name])
  );
});

describe('registration', () => {
  it('creates one disabled cell and one queued operation atomically', async () => {
    const { cell, operation } = await register('east');
    expect(cell.environment).toBe('test');
    expect(cell.database_name).toBe('nap_test_cell_east');
    expect(cell.enabled).toBe(false);
    expect(operation.cell_id).toBe(cell.id);
    expect(operation.stage).toBe('registered');
    expect(operation.status).toBe('queued');
    expect(operation.attempts).toBe(0);
    expect(await eventsFor(cell.id)).toEqual([
      { event_key: 'cell.registered', outcome: 'succeeded', details: {} },
    ]);
  });

  it('reports a duplicate suffix in the same environment as a conflict', async () => {
    await register('west');
    await expect(register('west')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects a malformed suffix or unsupported environment', async () => {
    await expect(
      registerCell(db, 'test', authority(), {
        operation: 'cell',
        suffix: 'NOT-LOWERCASE',
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      registerCell(db, 'staging', authority(), {
        operation: 'cell',
        suffix: 'east2',
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('refuses an actor with no control::write capability', async () => {
    const denied = {
      actorId: randomUUID(),
      granted: false,
      deniedTenantIds: [],
    };
    await expect(
      registerCell(db, 'test', denied, { operation: 'cell', suffix: 'north' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('retry', () => {
  it('retries a failed operation from the same IDs and increments attempts', async () => {
    const { cell, operation } = await register();
    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'started',
    });
    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'failed',
      failureCode: 'SETUP_TIMEOUT',
    });

    const retried = await retryCellProvisioning(db, authority(), cell.id);
    expect(retried.id).toBe(operation.id);
    expect(retried.operation_id).toBe(operation.operation_id);
    expect(retried.stage).toBe('registered');
    expect(retried.status).toBe('queued');
    expect(retried.attempts).toBe(1);
    expect(retried.failure_code).toBeNull();
    expect(await eventsFor(cell.id)).toContainEqual(
      expect.objectContaining({
        event_key: 'cell.retry.requested',
        details: { attempt: 1 },
      })
    );
  });

  it('returns the current operation unchanged while queued or running, without a new event', async () => {
    const { cell, operation } = await register();
    const beforeEvents = (await eventsFor(cell.id)).length;

    const stillQueued = await retryCellProvisioning(db, authority(), cell.id);
    expect(stillQueued).toEqual(operation);

    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'started',
    });
    const running = await retryCellProvisioning(db, authority(), cell.id);
    expect(running.status).toBe('running');
    expect(running.attempts).toBe(0);

    expect((await eventsFor(cell.id)).length).toBe(beforeEvents);
  });

  it('refuses to retry a completed operation', async () => {
    const { cell, operation } = await register();
    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'started',
    });
    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'advanced',
      stage: 'migration',
    });
    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'advanced',
      stage: 'seed',
    });
    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'advanced',
      stage: 'activation',
    });
    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'completed',
    });

    await expect(
      retryCellProvisioning(db, authority(), cell.id)
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('advances only one attempt under two concurrent retries', async () => {
    const { cell, operation } = await register();
    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'started',
    });
    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'failed',
      failureCode: 'SETUP_TIMEOUT',
    });

    const [first, second] = await Promise.all([
      retryCellProvisioning(db, authority(), cell.id),
      retryCellProvisioning(db, authority(), cell.id),
    ]);
    const attempts = [first.attempts, second.attempts].sort();
    expect(attempts).toEqual([1, 1]);
    expect(
      (await eventsFor(cell.id)).filter(
        event => event.event_key === 'cell.retry.requested'
      )
    ).toHaveLength(1);
  });

  it('reports a missing cell as not found', async () => {
    await expect(
      retryCellProvisioning(db, authority(), randomUUID())
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('disable', () => {
  it('disables a cell without deleting its registry record, and is idempotent', async () => {
    const { cell } = await register();
    const disabled = await disableCell(db, authority(), cell.id);
    expect(disabled.enabled).toBe(false);
    expect(disabled.id).toBe(cell.id);

    const again = await disableCell(db, authority(), cell.id);
    expect(again.enabled).toBe(false);
    expect(
      (await eventsFor(cell.id)).filter(
        event => event.event_key === 'cell.disabled'
      )
    ).toHaveLength(2);
  });

  it('reports a missing cell as not found', async () => {
    await expect(
      disableCell(db, authority(), randomUUID())
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe("support's Napsoft restriction", () => {
  it('denies retry and disable on a cell holding the Napsoft tenant, but not other cells', async () => {
    const { cell: napsoftCell, operation } = await register();
    const napsoft = await napsoftTenant(napsoftCell.id);
    const support = authority([napsoft]);

    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'started',
    });
    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'failed',
      failureCode: 'SETUP_TIMEOUT',
    });
    await expect(
      retryCellProvisioning(db, support, napsoftCell.id)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      disableCell(db, support, napsoftCell.id)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const { cell: otherCell } = await register();
    const other = await disableCell(db, support, otherCell.id);
    expect(other.enabled).toBe(false);
  });

  it('never affects registration, which has no tenant yet', async () => {
    const napsoft = await napsoftTenant(null);
    const support = authority([napsoft]);
    const { cell } = await registerCell(db, 'test', support, {
      operation: 'cell',
      suffix: 's' + randomUUID().replaceAll('-', '').slice(0, 12),
    });
    expect(cell.enabled).toBe(false);
  });
});

describe('provisioning progress', () => {
  it('runs the full lifecycle and enables the cell only on completion', async () => {
    const { cell, operation } = await register();
    const started = await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'started',
    });
    expect(started.stage).toBe('setup');
    expect(started.status).toBe('running');
    expect(started.started_at).not.toBeNull();

    for (const stage of ['migration', 'seed', 'activation']) {
      const advanced = await advanceCellProvisioning(
        db,
        operation.operation_id,
        {
          kind: 'advanced',
          stage,
        }
      );
      expect(advanced.stage).toBe(stage);
      expect(advanced.status).toBe('running');
    }

    const completed = await advanceCellProvisioning(
      db,
      operation.operation_id,
      {
        kind: 'completed',
      }
    );
    expect(completed.stage).toBe('complete');
    expect(completed.status).toBe('completed');
    expect(completed.completed_at).not.toBeNull();

    const readiness = await getCellReadiness(db, authority(), cell.id);
    expect(readiness.cell.enabled).toBe(true);
    expect(await eventsFor(cell.id)).toContainEqual(
      expect.objectContaining({ event_key: 'cell.provisioning.completed' })
    );
  });

  it('records a safe failure code without enabling the cell', async () => {
    const { cell, operation } = await register();
    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'started',
    });
    const failed = await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'failed',
      failureCode: 'SETUP_TIMEOUT',
    });
    expect(failed.status).toBe('failed');
    expect(failed.failure_code).toBe('SETUP_TIMEOUT');
    expect(
      (await getCellReadiness(db, authority(), cell.id)).cell.enabled
    ).toBe(false);
    expect(await eventsFor(cell.id)).toContainEqual(
      expect.objectContaining({
        event_key: 'cell.provisioning.failed',
        details: { step: 'setup', code: 'SETUP_TIMEOUT', attempt: 0 },
      })
    );
  });

  it('rejects an out-of-order transition', async () => {
    const { operation } = await register();
    await expect(
      advanceCellProvisioning(db, operation.operation_id, {
        kind: 'advanced',
        stage: 'seed',
      })
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'started',
    });
    await expect(
      advanceCellProvisioning(db, operation.operation_id, { kind: 'completed' })
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('reads', () => {
  it('pages the overview with each cell paired to its operation', async () => {
    const first = await register();
    const secondCell = await register();
    // Every earlier test in this file shares one database, so cursor order
    // by `id` does not put these two next to each other; a single page large
    // enough for everything this file has registered (well under the 100-row
    // maximum) is what makes the assertion deterministic instead of relying
    // on UUID ordering.
    const page = await getOverview(db, authority(), { limit: 100 });
    expect(page.nextCursor).toBeNull();
    const byId = new Map(page.rows.map(entry => [entry.cell.id, entry]));
    expect(byId.get(first.cell.id)?.operation.cell_id).toBe(first.cell.id);
    expect(byId.get(secondCell.cell.id)?.operation.cell_id).toBe(
      secondCell.cell.id
    );
  });

  it('advances the cursor to a strictly later page', async () => {
    const onePage = await getOverview(db, authority(), { limit: 1 });
    expect(onePage.rows).toHaveLength(1);
    expect(onePage.nextCursor).not.toBeNull();
    const nextPage = await getOverview(db, authority(), {
      cursor: onePage.nextCursor,
      limit: 1,
    });
    expect(nextPage.rows).toHaveLength(1);
    expect(nextPage.rows[0].cell.id).not.toBe(onePage.rows[0].cell.id);
  });

  it('reports honest, unwired runtime readiness distinct from the central flag', async () => {
    const { cell } = await register();
    const readiness = await getCellReadiness(db, authority(), cell.id);
    expect(readiness.cell.enabled).toBe(false);
    expect(readiness.runtime).toEqual({ ready: false, checked: false });
  });

  it('reports a missing cell as not found', async () => {
    await expect(
      getCellReadiness(db, authority(), randomUUID())
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses a reader with no control::read capability', async () => {
    const denied = {
      actorId: randomUUID(),
      granted: false,
      deniedTenantIds: [],
    };
    await expect(getOverview(db, denied, {})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('the provision command', () => {
  it('dispatches cell-retry and cell-disable by operation', async () => {
    const { cell, operation } = await register();
    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'started',
    });
    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'failed',
      failureCode: 'SETUP_TIMEOUT',
    });
    const retried = await executeProvisionCommand(db, authority(), {
      operation: 'cell-retry',
      cell: cell.id,
    });
    expect(retried.status).toBe('queued');
    const disabled = await executeProvisionCommand(db, authority(), {
      operation: 'cell-disable',
      cell: cell.id,
    });
    expect(disabled.enabled).toBe(false);
  });

  it('rejects an unrecognized operation', async () => {
    await expect(
      executeProvisionCommand(db, authority(), {
        operation: 'cell-explode',
        cell: randomUUID(),
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('credentials', () => {
  it('records no database credential or connection detail in any cell event', async () => {
    const { cell, operation } = await register();
    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'started',
    });
    await advanceCellProvisioning(db, operation.operation_id, {
      kind: 'failed',
      failureCode: 'SETUP_TIMEOUT',
    });
    await retryCellProvisioning(db, authority(), cell.id);
    await disableCell(db, authority(), cell.id);
    const stream = JSON.stringify(
      await db.any(
        "SELECT * FROM admin.managed_events WHERE target_type='cell' AND target_id=$1",
        [cell.id]
      )
    );
    for (const forbidden of [
      /password/i,
      /connection/i,
      /credential/i,
      /secret/i,
    ])
      expect(forbidden.test(stream)).toBe(false);
  });

  it('operates entirely under the nap-app runtime role', async () => {
    expect((await db.one('SELECT current_user AS user')).user).toBe('nap-app');
  });
});
