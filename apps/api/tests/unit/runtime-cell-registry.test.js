/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi } from 'vitest';
import { createCellRegistry } from '../../src/infrastructure/runtime/cellRegistry.js';

const CELL = '6f1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const OTHER = '7a1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const TENANT = '8b1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const connection = { endpoint: 'db.example/nap_cell_1', appPassword: 'pw' };

function fakeAdmin(records) {
  return {
    cells: { findOneBy: vi.fn(async ({ id }) => records[id] ?? null) },
    tenants: {
      findOneBy: vi.fn(async ({ id }) =>
        id === TENANT ? { id, cell_id: CELL } : null
      ),
    },
  };
}

function fakeConnect({ reachable = true, identity } = {}) {
  const handles = [];
  const connect = vi.fn(() => {
    const handle = {
      connect: vi.fn(async () => {
        if (!reachable) throw new Error('refused');
      }),
      close: vi.fn(async () => {}),
      db: {
        one: vi.fn(async sql =>
          sql.includes('current_database')
            ? { name: 'nap_cell_1' }
            : { '?column?': 1 }
        ),
        physical_identity: {
          findOneBy: vi.fn(async () =>
            identity === undefined
              ? { cell_id: CELL, database_name: 'nap_cell_1' }
              : identity
          ),
        },
      },
    };
    handles.push(handle);
    return handle;
  });
  return { connect, handles };
}

const record = (enabled = true) => ({
  id: CELL,
  database_name: 'nap_cell_1',
  enabled,
});

describe('runtime cell registry (I0003-R015–R022)', () => {
  it('reports each R015 check as its not-ready reason (AC03)', async () => {
    const cases = [
      [{}, {}, 'CELL_NOT_REGISTERED'],
      [{ [CELL]: record(false) }, {}, 'CELL_DISABLED'],
      [{ [CELL]: record() }, { reachable: false }, 'CELL_UNREACHABLE'],
      [{ [CELL]: record() }, { identity: null }, 'IDENTITY_MISSING'],
    ];
    for (const [records, options, reason] of cases) {
      const registry = createCellRegistry({
        admin: fakeAdmin(records),
        connect: fakeConnect(options).connect,
      });
      await registry.load({ [CELL]: connection });
      expect(registry.readiness(CELL)).toEqual({ ready: false, reason });
    }
  });

  it('loads a good cell beside a broken one and reports unknown cells', async () => {
    const registry = createCellRegistry({
      admin: fakeAdmin({ [CELL]: record() }),
      connect: fakeConnect().connect,
    });
    await registry.load({ [CELL]: connection, [OTHER]: connection });
    expect(registry.readiness(CELL)).toEqual({ ready: true });
    expect(registry.readiness(OTHER)).toEqual({
      ready: false,
      reason: 'CELL_NOT_REGISTERED',
    });
    expect(registry.readiness(TENANT)).toEqual({
      ready: false,
      reason: 'CELL_NOT_CONFIGURED',
    });
  });

  it('adds a disabled cell for activation and reuses its connection', async () => {
    const { connect } = fakeConnect();
    const registry = createCellRegistry({
      admin: fakeAdmin({ [CELL]: record(false) }),
      connect,
    });
    expect(await registry.add(CELL, connection)).toEqual({ ready: true });
    expect(await registry.add(CELL, connection)).toEqual({ ready: true });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('marks a disabled cell not ready and restores it on recheck (R021)', async () => {
    const admin = fakeAdmin({ [CELL]: record() });
    const registry = createCellRegistry({
      admin,
      connect: fakeConnect().connect,
    });
    await registry.load({ [CELL]: connection });
    registry.markDisabled(CELL);
    expect(registry.readiness(CELL)).toEqual({
      ready: false,
      reason: 'CELL_DISABLED',
    });
    expect(await registry.recheck(CELL)).toEqual({ ready: true });
  });

  it('finds the session tenant cell only when ready (R019)', async () => {
    const registry = createCellRegistry({
      admin: fakeAdmin({ [CELL]: record() }),
      connect: fakeConnect().connect,
    });
    await expect(registry.cellFor({ tenant: TENANT })).rejects.toThrow(
      'CELL_UNAVAILABLE'
    );
    await registry.load({ [CELL]: connection });
    expect(await registry.cellFor({ tenant: TENANT })).toHaveProperty(
      'physical_identity'
    );
    await expect(registry.cellFor({ tenant: OTHER })).rejects.toThrow(
      'CELL_UNAVAILABLE'
    );
    await expect(registry.cellFor({ tenant: null })).rejects.toThrow(
      'CELL_UNAVAILABLE'
    );
  });

  it('closes every connection (R022) and never leaks the endpoint', async () => {
    const { connect, handles } = fakeConnect();
    const registry = createCellRegistry({
      admin: fakeAdmin({ [CELL]: record() }),
      connect,
    });
    await registry.load({ [CELL]: connection });
    expect(JSON.stringify(registry.readiness(CELL))).not.toContain(
      'db.example'
    );
    await registry.close();
    expect(handles[0].close).toHaveBeenCalled();
    expect(registry.readiness(CELL).reason).toBe('CELL_NOT_CONFIGURED');
  });
});
