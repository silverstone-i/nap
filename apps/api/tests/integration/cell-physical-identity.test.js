/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { using } from '../../src/infrastructure/runtime/adminDatabase.js';
import { createCellDatabase } from '../../src/infrastructure/runtime/cellDatabase.js';
import { setupLocal } from '../../src/infrastructure/provisioning/postgres.js';
import { migrateCell } from '../../src/application/maintenance/migrateCell.js';
import { verifyPhysicalIdentity } from '../../src/modules/cell-tenancy/schema/identity.js';
import { roleUrl } from '../../src/application/shared/configuration.js';
const fixture = process.env.FOUNDATION_TEST_URL;
if (!fixture)
  throw new Error(
    'FOUNDATION_TEST_URL must identify a disposable PostgreSQL 18 server'
  );
const url = new URL(fixture);
const name = 'nap_cell_test_' + randomUUID().replaceAll('-', '');
const config = {
  database: name,
  environment: 'test',
  endpoint: url.host + '/' + name,
  maintenance: url.host + '/postgres',
  adminPassword: 'foundation-admin',
  appPassword: 'foundation-app',
};
const asApp = async operation => {
  const app = createCellDatabase(
    roleUrl(config.endpoint, 'nap-app', config.appPassword)
  );
  try {
    await app.connect();
    return await operation(app.db);
  } finally {
    await app.close();
  }
};
const setIdentity = row =>
  db.tx(async tx => {
    await tx.none('DELETE FROM cell.physical_identity');
    if (row)
      await tx.none(
        "INSERT INTO cell.physical_identity(cell_id,database_name,operation_id,environment) VALUES($1,$2,$3,'test')",
        [row.cell_id, row.database_name, row.operation_id ?? randomUUID()]
      );
  });
let handle, db;
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
  expect((await setupLocal(config)).status).toBe('created');
  await migrateCell(config);
  handle = createCellDatabase(
    roleUrl(config.endpoint, 'nap-admin', config.adminPassword)
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
it('is not ready with IDENTITY_MISSING when the cell has no identity row', async () => {
  await asApp(async app => {
    await expect(
      verifyPhysicalIdentity(
        { db: app },
        { id: randomUUID(), database_name: name }
      )
    ).resolves.toEqual({ ready: false, reason: 'IDENTITY_MISSING' });
  });
});
it('is ready when the identity row, admin.cells record, and current_database() all agree', async () => {
  const cellId = randomUUID();
  await setIdentity({ cell_id: cellId, database_name: name });
  await asApp(async app => {
    await expect(
      verifyPhysicalIdentity({ db: app }, { id: cellId, database_name: name })
    ).resolves.toEqual({ ready: true });
  });
});
it('is not ready with IDENTITY_MISMATCH when the row names a different cell', async () => {
  const cellId = randomUUID();
  await setIdentity({ cell_id: cellId, database_name: name });
  await asApp(async app => {
    await expect(
      verifyPhysicalIdentity(
        { db: app },
        { id: randomUUID(), database_name: name }
      )
    ).resolves.toEqual({ ready: false, reason: 'IDENTITY_MISMATCH' });
  });
});
it('is not ready with DATABASE_MISMATCH when the row disagrees with the admin.cells database name', async () => {
  const cellId = randomUUID();
  await setIdentity({ cell_id: cellId, database_name: name });
  await asApp(async app => {
    await expect(
      verifyPhysicalIdentity(
        { db: app },
        { id: cellId, database_name: 'nap_cell_test_someone_else' }
      )
    ).resolves.toEqual({ ready: false, reason: 'DATABASE_MISMATCH' });
  });
});
it('is not ready with DATABASE_MISMATCH when the row disagrees with the physical database itself', async () => {
  const cellId = randomUUID();
  await setIdentity({
    cell_id: cellId,
    database_name: 'nap_cell_test_someone_else',
  });
  await asApp(async app => {
    await expect(
      verifyPhysicalIdentity(
        { db: app },
        { id: cellId, database_name: 'nap_cell_test_someone_else' }
      )
    ).resolves.toEqual({ ready: false, reason: 'DATABASE_MISMATCH' });
  });
});
it('never writes to cell.physical_identity and reports no compared value or credential', async () => {
  const cellId = randomUUID();
  await setIdentity({ cell_id: cellId, database_name: name });
  const before = await db.one('SELECT * FROM cell.physical_identity');
  await asApp(async app => {
    const mismatch = await verifyPhysicalIdentity(
      { db: app },
      { id: randomUUID(), database_name: name }
    );
    expect(Object.keys(mismatch).sort()).toEqual(['ready', 'reason']);
    expect(JSON.stringify(mismatch)).not.toMatch(/password|nap_cell_test/);
  });
  expect(await db.one('SELECT * FROM cell.physical_identity')).toEqual(before);
});
it('rejects a malformed admin.cells record before querying anything', async () => {
  for (const bad of [
    undefined,
    null,
    {},
    { id: randomUUID() },
    { database_name: name },
  ])
    await expect(verifyPhysicalIdentity({ db: {} }, bad)).rejects.toThrow(
      'INVALID_ADMIN_CELL_RECORD'
    );
});
it('rejects a malformed cell handle before querying anything', async () => {
  const validRecord = { id: randomUUID(), database_name: name };
  for (const bad of [undefined, null, {}, { db: undefined }])
    await expect(verifyPhysicalIdentity(bad, validRecord)).rejects.toThrow(
      'INVALID_CELL_HANDLE'
    );
});
