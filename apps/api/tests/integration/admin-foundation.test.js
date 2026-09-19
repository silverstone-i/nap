/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, it, expect } from 'vitest';
import { checkAdminReadiness } from '../../src/infrastructure/runtime/adminReadiness.js';
import { randomUUID } from 'node:crypto';
import { defineMigration } from 'pg-schemata';
import {
  createAdminDatabase,
  using,
} from '../../src/infrastructure/runtime/adminDatabase.js';
import {
  setupLocal,
  verifyRoles,
} from '../../src/infrastructure/provisioning/postgres.js';
import { migrateAdmin } from '../../src/application/maintenance/migrateAdmin.js';
import { verifyAdmin } from '../../src/modules/admin-tenancy/schema/verify.js';
import { adminModules } from '../../src/modules/admin.js';
import { roleUrl } from '../../src/application/shared/configuration.js';
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
beforeAll(async () => {
  await using(fixture, async tx => {
    const v = await tx.one('SHOW server_version_num');
    expect(Number(v.server_version_num)).toBeGreaterThanOrEqual(180000);
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
  handle = createAdminDatabase(
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
it('migrates concurrently once, verifies all catalog details, and leaves all module tables empty', async () => {
  const results = await Promise.all([
    migrateAdmin(config),
    migrateAdmin(config),
  ]);
  expect(results.map(r => r.status).sort()).toEqual(['applied', 'unchanged']);
  for (const table of Object.keys(adminModules[0].models))
    expect(
      Number(
        (await db.one('SELECT count(*) FROM admin.$1:name', [table])).count
      )
    ).toBe(0);
  await verifyAdmin(handle, adminModules);
}, 30000);
it('preserves existing data across setup and migration, including archived rows', async () => {
  const row = await db.one(
    "INSERT INTO admin.tenants(tenant_code,name,deactivated_at) VALUES('ARCHIVED','Archived',now()) RETURNING id"
  );
  expect((await setupLocal(config)).status).toBe('unchanged');
  expect((await migrateAdmin(config)).status).toBe('unchanged');
  expect(
    (
      await db.one('SELECT deactivated_at FROM admin.tenants WHERE id=$1', [
        row.id,
      ])
    ).deactivated_at
  ).not.toBeNull();
});
it('rejects drift without claiming successful migration', async () => {
  await db.none(
    'ALTER TABLE admin.tenants ALTER COLUMN revision DROP NOT NULL'
  );
  try {
    await expect(migrateAdmin(config)).rejects.toThrow(
      'CATALOG_CONTRACT_MISMATCH'
    );
  } finally {
    await db.none(
      'ALTER TABLE admin.tenants ALTER COLUMN revision SET NOT NULL'
    );
  }
});
it('rolls back failed migrations and refuses checksum changes', async () => {
  const failure = defineMigration({
    id: '002-fail',
    up: async ({ db }) => {
      await db.none('CREATE TABLE admin.rollback_probe(id integer)');
      throw new Error('fixture failure');
    },
  });
  await expect(
    handle.migrate({
      schema: 'admin',
      modules: [
        {
          ...adminModules[0],
          migrations: [...adminModules[0].migrations, failure],
        },
      ],
    })
  ).rejects.toThrow('fixture failure');
  expect(
    (await db.one("SELECT to_regclass('admin.rollback_probe') AS table")).table
  ).toBeNull();
  expect(
    Number((await db.one('SELECT count(*) FROM admin.schema_migrations')).count)
  ).toBe(1);
  const changed = defineMigration({
    id: '001-admin-tenancy',
    up: async () => {},
  });
  await expect(
    handle.migrate({
      schema: 'admin',
      modules: [{ ...adminModules[0], migrations: [changed] }],
    })
  ).rejects.toThrow(/checksum|hash/i);
});
it('allows runtime CRUD but denies DDL, ledger access, and event modification', async () => {
  await using(
    roleUrl(config.endpoint, 'nap-app', config.appPassword),
    async runtime => {
      const row = await runtime.one(
        "INSERT INTO admin.tenants(tenant_code,name) VALUES('RUNTIME','Runtime') RETURNING *"
      );
      await runtime.none(
        "UPDATE admin.tenants SET name='Changed' WHERE id=$1",
        [row.id]
      );
      expect(
        (
          await runtime.one('SELECT name FROM admin.tenants WHERE id=$1', [
            row.id,
          ])
        ).name
      ).toBe('Changed');
      await runtime.none('DELETE FROM admin.tenants WHERE id=$1', [row.id]);
      for (const sql of [
        'CREATE TABLE admin.forbidden(id integer)',
        'CREATE TEMP TABLE forbidden(id integer)',
        'SELECT * FROM admin.schema_migrations',
        'DELETE FROM admin.schema_migrations',
        'TRUNCATE admin.tenants',
      ])
        await expect(runtime.none(sql)).rejects.toMatchObject({
          code: '42501',
        });
      const event = await runtime.one(
        "INSERT INTO admin.managed_events(deduplication_key,event_key,outcome) VALUES(gen_random_uuid(),'test','succeeded') RETURNING id"
      );
      await expect(
        runtime.none('DELETE FROM admin.managed_events WHERE id=$1', [event.id])
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        runtime.none(
          "UPDATE admin.managed_events SET reason='changed' WHERE id=$1",
          [event.id]
        )
      ).rejects.toMatchObject({ code: '23514' });
    }
  );
});
it('enforces immutable fields, audit timestamps, uniqueness, checks and foreign keys through SQL', async () => {
  const row = await db.one(
    "INSERT INTO admin.tenants(tenant_code,name) VALUES('CHECKS','Checks') RETURNING *"
  );
  await expect(
    db.none("UPDATE admin.tenants SET tenant_code='OTHER' WHERE id=$1", [
      row.id,
    ])
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    db.none('UPDATE admin.tenants SET id=gen_random_uuid() WHERE id=$1', [
      row.id,
    ])
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    db.none('UPDATE admin.tenants SET revision=0 WHERE id=$1', [row.id])
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    db.none('UPDATE admin.tenants SET cell_id=gen_random_uuid() WHERE id=$1', [
      row.id,
    ])
  ).rejects.toMatchObject({ code: '23503' });
  await expect(
    db.none(
      "INSERT INTO admin.tenants(tenant_code,name) VALUES('checks','Duplicate')"
    )
  ).rejects.toMatchObject({ code: '23505' });
  const changed = await db.one(
    "UPDATE admin.tenants SET name='Changed' WHERE id=$1 RETURNING updated_at",
    [row.id]
  );
  expect(changed.updated_at.getTime()).toBeGreaterThanOrEqual(
    row.updated_at.getTime()
  );
});
it('protects root records while allowing their first cell assignment after bootstrap', async () => {
  const tenant = await db.one(
    "INSERT INTO admin.tenants(tenant_code,name,is_napsoft,status) VALUES('ROOT','Owner',true,'active') RETURNING id"
  );
  const user = await db.one(
    "INSERT INTO admin.portal_users(email,password_hash,is_root) VALUES('root@test','fixture',true) RETURNING id"
  );
  const membership = await db.one(
    "INSERT INTO admin.portal_user_tenants(portal_user_id,tenant_id,status,ready) VALUES($1,$2,'active',true) RETURNING id",
    [user.id, tenant.id]
  );
  const cell = await db.one(
    "INSERT INTO admin.cells(environment,database_name) VALUES('test','root_cell') RETURNING id"
  );
  await db.none('UPDATE admin.tenants SET cell_id=$1 WHERE id=$2', [
    cell.id,
    tenant.id,
  ]);
  await expect(
    db.none('UPDATE admin.tenants SET cell_id=NULL WHERE id=$1', [tenant.id])
  ).rejects.toMatchObject({ code: '23514' });
  for (const sql of [
    "UPDATE admin.portal_users SET email='other@test' WHERE id=$1",
    "UPDATE admin.portal_users SET status='disabled' WHERE id=$1",
    'UPDATE admin.portal_users SET deactivated_at=now() WHERE id=$1',
    'DELETE FROM admin.portal_users WHERE id=$1',
  ])
    await expect(db.none(sql, [user.id])).rejects.toMatchObject({
      code: '23514',
    });
  for (const sql of [
    "UPDATE admin.portal_user_tenants SET status='suspended' WHERE id=$1",
    'UPDATE admin.portal_user_tenants SET deactivated_at=now() WHERE id=$1',
    'DELETE FROM admin.portal_user_tenants WHERE id=$1',
  ])
    await expect(db.none(sql, [membership.id])).rejects.toMatchObject({
      code: '23514',
    });
});
it('allows eligible reassignment and blocks provisioned or archived-membership assignments', async () => {
  const cells = await db.any(
    "INSERT INTO admin.cells(environment,database_name) VALUES('test','cell_a'),('test','cell_b') RETURNING id"
  );
  const tenant = await db.one(
    "INSERT INTO admin.tenants(tenant_code,name,cell_id) VALUES('MOVE','Move',$1) RETURNING id",
    [cells[0].id]
  );
  await db.none('UPDATE admin.tenants SET cell_id=$1 WHERE id=$2', [
    cells[1].id,
    tenant.id,
  ]);
  await db.none('UPDATE admin.tenants SET cell_id=NULL WHERE id=$1', [
    tenant.id,
  ]);
  await db.none(
    'UPDATE admin.tenants SET cell_id=$1,provisioned=true WHERE id=$2',
    [cells[0].id, tenant.id]
  );
  await expect(
    db.none(
      'UPDATE admin.tenants SET cell_id=$1,provisioned=false WHERE id=$2',
      [cells[1].id, tenant.id]
    )
  ).rejects.toMatchObject({ code: '23514' });
  const user = await db.one(
    "INSERT INTO admin.portal_users(email,password_hash) VALUES('member@test','fixture') RETURNING id"
  );
  const other = await db.one(
    "INSERT INTO admin.tenants(tenant_code,name,cell_id) VALUES('MEMBER','Member',$1) RETURNING id",
    [cells[0].id]
  );
  await expect(
    db.none(
      "INSERT INTO admin.portal_user_tenants(portal_user_id,tenant_id,status,ready) VALUES($1,$2,'active',true)",
      [user.id, other.id]
    )
  ).rejects.toMatchObject({ code: '23514' });
  await db.none(
    "INSERT INTO admin.portal_user_tenants(portal_user_id,tenant_id,member_type,deactivated_at) VALUES($1,$2,'employee',now())",
    [user.id, other.id]
  );
  await expect(
    db.none('UPDATE admin.tenants SET cell_id=NULL WHERE id=$1', [other.id])
  ).rejects.toMatchObject({ code: '23514' });
});
it('rejects missing and unsafe runtime roles without modifying their credentials', async () => {
  await using(fixture, async admin => {
    await admin.none('ALTER ROLE "nap-app" NOLOGIN');
    try {
      await expect(setupLocal(config)).rejects.toThrow('UNSAFE_RUNTIME_ROLE');
    } finally {
      await admin.none('ALTER ROLE "nap-app" LOGIN');
    }
    await admin.none('ALTER ROLE "nap-app" RENAME TO foundation_hidden_role');
    try {
      await expect(verifyRoles(db)).rejects.toThrow('UNSAFE_RUNTIME_ROLE');
    } finally {
      await admin.none('ALTER ROLE foundation_hidden_role RENAME TO "nap-app"');
    }
  });
  await expect(
    setupLocal({ ...config, appPassword: 'incorrect' })
  ).rejects.toThrow('SETUP_FAILED');
});
it('serializes membership creation with cell reassignment', async () => {
  const cells = await db.any(
    "INSERT INTO admin.cells(environment,database_name) VALUES('test','race_a'),('test','race_b') RETURNING id"
  );
  const tenant = await db.one(
    "INSERT INTO admin.tenants(tenant_code,name,cell_id) VALUES('RACE','Race',$1) RETURNING id",
    [cells[0].id]
  );
  const user = await db.one(
    "INSERT INTO admin.portal_users(email,password_hash) VALUES('race@test','fixture') RETURNING id"
  );
  let release, inserted;
  const ready = new Promise(r => (inserted = r));
  const gate = new Promise(r => (release = r));
  const membership = db.tx(async tx => {
    await tx.none(
      "INSERT INTO admin.portal_user_tenants(portal_user_id,tenant_id,member_type) VALUES($1,$2,'employee')",
      [user.id, tenant.id]
    );
    inserted();
    await gate;
  });
  await ready;
  const reassignment = db.none(
    'UPDATE admin.tenants SET cell_id=$1 WHERE id=$2',
    [cells[1].id, tenant.id]
  );
  const assertion = expect(reassignment).rejects.toMatchObject({
    code: '23514',
  });
  release();
  await membership;
  await assertion;
});
it('closes maintenance pools after success and verification failure', async () => {
  await migrateAdmin(config);
  await expect(
    migrateAdmin({ ...config, adminPassword: 'incorrect' })
  ).rejects.toBeDefined();
  const connections = await using(fixture, admin =>
    admin.any('SELECT pid FROM pg_stat_activity WHERE datname=$1', [name])
  );
  // Only the suite-owned handle remains connected.
  expect(connections.length).toBeLessThanOrEqual(4);
});
it('rejects incompatible ownership without adopting the database', async () => {
  await using(fixture, async admin => {
    await admin.none('ALTER DATABASE $1:name OWNER TO postgres', [name]);
    try {
      await expect(setupLocal(config)).rejects.toThrow(
        'DATABASE_OWNER_MISMATCH'
      );
      expect(
        (
          await admin.one(
            'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',
            [name]
          )
        ).owner
      ).toBe('postgres');
    } finally {
      await admin.none('ALTER DATABASE $1:name OWNER TO "nap-admin"', [name]);
    }
  });
});

it('checks runtime readiness with nap-app and rejects missing grants or maintenance credentials', async () => {
  const runtime = createAdminDatabase(
    roleUrl(config.endpoint, 'nap-app', config.appPassword)
  );
  try {
    await runtime.connect();
    expect(await checkAdminReadiness(runtime)).toBe(true);
    expect(await checkAdminReadiness(handle)).toBe(false);
    await db.none('REVOKE DELETE ON admin.tenants FROM "nap-app"');
    try {
      expect(await checkAdminReadiness(runtime)).toBe(false);
    } finally {
      await db.none('GRANT DELETE ON admin.tenants TO "nap-app"');
    }
  } finally {
    await runtime.close();
  }
});
