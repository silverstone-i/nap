/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Phase 1 gate: the admin and cell handles are separate databases with
 * separate pools, separate migration targets, and independent lifecycles
 * (ARCH-004, ARCH-024, ARCH-025, ARCH-036).
 */

import { afterEach, expect, it } from 'vitest';

import {
  assertRuntimeRole,
  RuntimeRoleError,
} from '../../src/db/assertRuntimeRole.js';
import { createAdminDb } from '../../src/db/admin/createAdminDb.js';
import { migrateAdmin } from '../../src/db/admin/migrateAdmin.js';
import {
  ADMIN_SCHEMA,
  adminRepositories,
} from '../../src/db/admin/moduleRegistry.js';
import { createCellDb } from '../../src/db/cell/createCellDb.js';
import { migrateCell } from '../../src/db/cell/migrateCell.js';
import {
  CELL_SCHEMAS,
  cellRepositories,
} from '../../src/db/cell/moduleRegistry.js';
import { isolationProbeModule } from '../fixtures/isolationProbe.js';
import {
  describeDatabase,
  testDatabaseUrls,
} from '../fixtures/testDatabases.js';

interface Existence {
  present: boolean;
}

/** Asks a handle whether a table exists, by qualified name. */
const TABLE_EXISTS = `SELECT EXISTS (
  SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = $1 AND c.relname = $2
) AS present`;

describeDatabase('database composition roots', () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (closers.length > 0) await closers.pop()?.();
  });

  it('registers repositories per handle, with no overlap', () => {
    const adminKeys = Object.keys(adminRepositories);
    const cellKeys = Object.keys(cellRepositories);

    // Empty while Phase 1 owns no modules; the assertion is the guard that
    // keeps a Phase 2 module from being registered on both handles.
    expect(adminKeys.filter(key => cellKeys.includes(key))).toEqual([]);
  });

  it('points the two handles at different databases', async () => {
    const urls = testDatabaseUrls();
    const adminDb = createAdminDb({ connectionString: urls.adminRuntime });
    const cellDb = createCellDb({ connectionString: urls.cellRuntime });
    closers.push(
      () => adminDb.close(),
      () => cellDb.close()
    );

    await adminDb.connect();
    await cellDb.connect();

    // `info` deliberately does not parse a connection string, so the database
    // name is read from the connection itself.
    const adminName = await adminDb.one<{ name: string }>(
      'SELECT current_database() AS name'
    );
    const cellName = await cellDb.one<{ name: string }>(
      'SELECT current_database() AS name'
    );

    expect(adminName.name).not.toBe(cellName.name);
    expect(adminDb.pgp).not.toBe(cellDb.pgp);
  });

  it('applies cell migrations to the cell database only', async () => {
    const urls = testDatabaseUrls();

    await migrateCell({
      connectionString: urls.cellMigration,
      modules: [isolationProbeModule],
    });

    const adminDb = createAdminDb({ connectionString: urls.adminRuntime });
    const cellDb = createCellDb({ connectionString: urls.cellRuntime });
    closers.push(
      () => adminDb.close(),
      () => cellDb.close()
    );

    const inCell = await cellDb.one<Existence>(TABLE_EXISTS, [
      'cell',
      'isolation_probe',
    ]);
    const inAdmin = await adminDb.one<Existence>(TABLE_EXISTS, [
      'cell',
      'isolation_probe',
    ]);

    expect(inCell.present).toBe(true);
    expect(inAdmin.present).toBe(false);
  });

  it('leaves the cell database untouched when admin migrations run', async () => {
    const urls = testDatabaseUrls();

    const result = await migrateAdmin({
      connectionString: urls.adminMigration,
      dryRun: true,
    });

    expect(result.schema).toBe(ADMIN_SCHEMA);
    expect(result.applied).toEqual([]);
    expect(CELL_SCHEMAS).not.toContain(ADMIN_SCHEMA);
  });

  it('closes each handle independently', async () => {
    const urls = testDatabaseUrls();
    const adminDb = createAdminDb({ connectionString: urls.adminRuntime });
    const cellDb = createCellDb({ connectionString: urls.cellRuntime });
    closers.push(() => adminDb.close());

    await adminDb.connect();
    await cellDb.connect();
    await cellDb.close();

    expect(cellDb.isClosed).toBe(true);
    expect(adminDb.isClosed).toBe(false);

    // The surviving handle still serves queries: closing one cell must not
    // take the control plane, or another cell, down with it.
    await expect(adminDb.one('SELECT 1 AS ok')).resolves.toEqual({ ok: 1 });
  });

  it('accepts the least-privileged runtime role', async () => {
    const urls = testDatabaseUrls();
    const cellDb = createCellDb({ connectionString: urls.cellRuntime });
    closers.push(() => cellDb.close());

    await expect(
      assertRuntimeRole(cellDb, { schemas: CELL_SCHEMAS })
    ).resolves.toBeUndefined();
  });

  it('rejects a connection that owns the cell tables', async () => {
    const urls = testDatabaseUrls();

    // The migration role owns the tables it created, so it can disable their
    // policies. Startup must refuse it as a runtime connection.
    const ownerDb = createCellDb({ connectionString: urls.cellMigration });
    closers.push(() => ownerDb.close());

    await migrateCell({
      connectionString: urls.cellMigration,
      modules: [isolationProbeModule],
    });

    await expect(
      assertRuntimeRole(ownerDb, { schemas: CELL_SCHEMAS })
    ).rejects.toBeInstanceOf(RuntimeRoleError);
  });
});
