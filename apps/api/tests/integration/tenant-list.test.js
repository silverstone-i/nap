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
import { listTenants } from '../../src/modules/admin-tenancy/domain/tenants.js';
import { insertTenant } from './helpers/tenantRows.js';

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
 * Build a write authority for a platform-admin operator.
 * @returns {{actorId: string, granted: boolean}}
 */
function authority() {
  return { actorId: randomUUID(), granted: true };
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

describe('reads', () => {
  it('pages every created tenant in ascending id order', async () => {
    const write = authority();
    const created = [];
    for (let index = 0; index < 3; index += 1)
      created.push(await insertTenant(db));
    created.sort((a, b) => (a.id < b.id ? -1 : 1));

    const firstPage = await listTenants(db, write, { limit: 2 });
    expect(firstPage.rows.length).toBeGreaterThanOrEqual(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const seen = [...firstPage.rows];
    let cursor = firstPage.nextCursor;
    while (cursor) {
      const page = await listTenants(db, write, { cursor, limit: 2 });
      seen.push(...page.rows);
      cursor = page.nextCursor;
    }
    for (const tenant of created)
      expect(seen).toContainEqual(expect.objectContaining({ id: tenant.id }));
  });

  it('advances the cursor to a strictly later page with no overlap', async () => {
    const write = authority();
    for (let index = 0; index < 3; index += 1) await insertTenant(db);
    const firstPage = await listTenants(db, write, { limit: 1 });
    const secondPage = await listTenants(db, write, {
      cursor: firstPage.nextCursor,
      limit: 1,
    });
    expect(secondPage.rows[0].id).not.toBe(firstPage.rows[0].id);
    expect(secondPage.rows[0].id > firstPage.rows[0].id).toBe(true);
  });

  it("returns one client's tenant, and allows one active tenant per client (I0006-R001)", async () => {
    const clientId = randomUUID();
    const tenant = await insertTenant(db, { client_id: clientId });
    await insertTenant(db, { client_id: randomUUID() });
    const result = await listTenants(db, authority(), { clientId });
    expect(result.rows.map(row => [row.id, row.clientId])).toEqual([
      [tenant.id, clientId],
    ]);
    await expect(
      insertTenant(db, { client_id: clientId })
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('refuses an actor with no control::read capability', async () => {
    const denied = {
      actorId: randomUUID(),
      granted: false,
    };
    await expect(listTenants(db, denied)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
