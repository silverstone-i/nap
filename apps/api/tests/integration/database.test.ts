/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { defineMigration, TableModel } from 'pg-schemata';
import type { MigrationContext } from 'pg-schemata';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postgresFixture } from '../fixtures/postgres.js';
import { createAdminDatabase } from '../../src/db/admin/index.js';
import { createCellDatabase } from '../../src/db/cell/index.js';
import { assertRuntimeRole } from '../../src/db/assertRuntimeRole.js';
import { migrateDatabase } from '../../src/db/migrate.js';
import { CELL_SCHEMAS } from '../../src/db/modules.js';
import type { NapModuleDescriptor } from '../../src/db/modules.js';

let fixture: Awaited<ReturnType<typeof postgresFixture>>;
beforeAll(async () => {
  fixture = await postgresFixture();
}, 30000);
afterAll(async () => {
  await fixture?.cleanup();
}, 30000);

/** Frozen test-only table DDL; never registered in a production module. */
async function firstTable({ db, pgp, schema }: MigrationContext) {
  await new TableModel(db, pgp, {
    dbSchema: schema,
    table: 'first_probe',
    columns: [{ name: 'id', type: 'integer', notNull: true }],
    constraints: { primaryKey: ['id'] },
  }).createTable();
}
/** Frozen second-step fixture proves incremental migration equivalence. */
async function secondTable({ db, pgp, schema }: MigrationContext) {
  await new TableModel(db, pgp, {
    dbSchema: schema,
    table: 'second_probe',
    columns: [{ name: 'value', type: 'text', notNull: true }],
    constraints: { primaryKey: ['value'] },
  }).createTable();
}
const first = defineMigration({ id: 'z-first', up: firstTable });
const second = defineMigration({ id: 'a-second', up: secondTable });
const module = (
  schema: 'admin' | (typeof CELL_SCHEMAS)[number],
  migrations = [first, second]
): NapModuleDescriptor =>
  schema === 'admin'
    ? { name: 'fixture', databaseTarget: 'admin', schema, migrations }
    : { name: `fixture_${schema}`, databaseTarget: 'cell', schema, migrations };

it('connects and closes handles independently, with safe runtime roles', async () => {
  const admin = createAdminDatabase(fixture.env.ADMIN_DATABASE_URL_TEST);
  const cell = createCellDatabase(fixture.env.CELL_DATABASE_URL_TEST);
  try {
    await Promise.all([admin.connect(), cell.connect()]);
    await assertRuntimeRole(admin);
    await assertRuntimeRole(cell);
    await admin.close();
    await admin.close();
    expect(await cell.one('SELECT 1 AS value')).toEqual({ value: 1 });
  } finally {
    await Promise.all([admin.close(), cell.close()]);
  }
});
it.each(['SUPERUSER', 'BYPASSRLS', 'CREATEROLE', 'CREATEDB', 'REPLICATION'])(
  'rejects %s on the runtime role',
  async flag => {
    await fixture.control.none(`ALTER ROLE $1:name ${flag}`, [fixture.role]);
    const db = createCellDatabase(fixture.env.CELL_DATABASE_URL_TEST);
    try {
      await expect(assertRuntimeRole(db)).rejects.toThrow(
        'verification failed'
      );
    } finally {
      await db.close();
      await fixture.control.none(`ALTER ROLE $1:name NO${flag}`, [
        fixture.role,
      ]);
    }
  }
);
it('rejects table ownership and schema-creation grants', async () => {
  const owner = fixture.owner(fixture.cellUrl);
  const db = createCellDatabase(fixture.env.CELL_DATABASE_URL_TEST);
  try {
    await owner.none(
      'CREATE TABLE public.ownership_probe (id integer); ALTER TABLE public.ownership_probe OWNER TO $1:name',
      [fixture.role]
    );
    await expect(assertRuntimeRole(db)).rejects.toThrow('verification failed');
    await owner.none('DROP TABLE public.ownership_probe');
    await owner.none('GRANT CREATE ON SCHEMA public TO $1:name', [
      fixture.role,
    ]);
    await expect(assertRuntimeRole(db)).rejects.toThrow('verification failed');
    await owner.none('REVOKE CREATE ON SCHEMA public FROM $1:name', [
      fixture.role,
    ]);
    await assertRuntimeRole(db);
  } finally {
    await owner.none(
      'DROP TABLE IF EXISTS public.ownership_probe; REVOKE CREATE ON SCHEMA public FROM $1:name',
      [fixture.role]
    );
    await db.close();
  }
});
it('rejects direct and transitive NOINHERIT membership in privileged and owning roles', async () => {
  const group = await fixture.createRole('group');
  const middle = await fixture.createRole('middle');
  const db = createCellDatabase(fixture.env.CELL_DATABASE_URL_TEST);
  const owner = fixture.owner(fixture.cellUrl);
  try {
    await fixture.control.none(
      'ALTER ROLE $1:name BYPASSRLS; GRANT $1:name TO $2:name WITH INHERIT FALSE',
      [group, fixture.role]
    );
    await expect(assertRuntimeRole(db)).rejects.toThrow('verification failed');
    await fixture.control.none(
      'REVOKE $1:name FROM $2:name; GRANT $1:name TO $3:name WITH INHERIT FALSE; GRANT $3:name TO $2:name WITH INHERIT FALSE',
      [group, fixture.role, middle]
    );
    await expect(assertRuntimeRole(db)).rejects.toThrow('verification failed');
    await fixture.control.none('ALTER ROLE $1:name NOBYPASSRLS', [group]);
    await owner.none(
      'CREATE TABLE public.group_probe (id integer); ALTER TABLE public.group_probe OWNER TO $1:name',
      [group]
    );
    await expect(assertRuntimeRole(db)).rejects.toThrow('verification failed');
  } finally {
    await owner.none('DROP TABLE IF EXISTS public.group_probe');
    await fixture.control.none(
      'REVOKE $1:name FROM $2:name; REVOKE $3:name FROM $1:name',
      [middle, fixture.role, group]
    );
    await db.close();
  }
});
it('initializes empty canonical schemas independently and reruns without granting runtime tracking access', async () => {
  await migrateDatabase('admin', fixture.adminUrl, []);
  const admin = fixture.owner(fixture.adminUrl);
  const cell = fixture.owner(fixture.cellUrl);
  expect(
    await cell.one("SELECT to_regclass('cell.schema_migrations') AS table_name")
  ).toEqual({ table_name: null });
  expect(
    await admin.one(
      'SELECT count(*)::int AS count FROM admin.schema_migrations'
    )
  ).toEqual({ count: 0 });
  await migrateDatabase('cell', fixture.cellUrl, []);
  await migrateDatabase('cell', fixture.cellUrl, []);
  for (const schema of CELL_SCHEMAS) {
    expect(
      await cell.one(
        'SELECT count(*)::int AS count FROM $1:name.schema_migrations',
        [schema]
      )
    ).toEqual({ count: 0 });
  }
  expect(
    await cell.one(
      "SELECT has_table_privilege($1, 'cell.schema_migrations', 'INSERT') AS allowed",
      [fixture.role]
    )
  ).toEqual({ allowed: false });
});
it('applies shuffled schemas in canonical order and preserves declared migration order', async () => {
  const url = await fixture.createDatabase('ordered');
  const observed: string[] = [];
  const modules = [...CELL_SCHEMAS].reverse().map(schema =>
    module(schema, [
      defineMigration({
        id: 'z-first',
        up: () => {
          observed.push(`${schema}:first`);
          return Promise.resolve();
        },
      }),
      defineMigration({
        id: 'a-second',
        up: () => {
          observed.push(`${schema}:second`);
          return Promise.resolve();
        },
      }),
    ])
  );
  await migrateDatabase('cell', url, modules);
  expect(observed).toEqual(
    CELL_SCHEMAS.flatMap(schema => [`${schema}:first`, `${schema}:second`])
  );
  await migrateDatabase('cell', url, modules);
  expect(observed).toHaveLength(8);
});
it('produces the same fresh and upgraded schema, rejecting changed applied migrations', async () => {
  const fresh = await fixture.createDatabase('fresh');
  const upgrade = await fixture.createDatabase('upgrade');
  await migrateDatabase('admin', fresh, [module('admin')]);
  await migrateDatabase('admin', upgrade, [module('admin', [first])]);
  await migrateDatabase('admin', upgrade, [module('admin')]);
  const snapshot = async (url: string) => {
    const db = fixture.owner(url);
    return {
      columns: await db.any(`
        SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns WHERE table_schema = 'admin'
        ORDER BY table_name, ordinal_position`),
      constraints: await db.any(`
        SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'admin' ORDER BY c.conname`),
      indexes: await db.any(`
        SELECT tablename, indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'admin' ORDER BY tablename, indexname`),
    };
  };
  expect(await snapshot(fresh)).toEqual(await snapshot(upgrade));
  const changed = defineMigration({
    id: first.id,
    description: 'changed',
    up: firstTable,
  });
  await expect(
    migrateDatabase('admin', upgrade, [module('admin', [changed, second])])
  ).rejects.toThrow();
  await migrateDatabase('admin', upgrade, [module('admin')]);
});
it('rolls back the failing schema, retains earlier cell schemas, and resumes unchanged migrations', async () => {
  const url = await fixture.createDatabase('retry');
  let unavailable = true; // A transient test dependency, not a migration source change.
  const transient = defineMigration({
    id: 'transient',
    up: async context => {
      if (unavailable) throw new Error('Fixture dependency unavailable');
      await secondTable(context);
    },
  });
  const modules = [
    module('cell', [first]),
    module('reference', [first, transient]),
  ];
  await expect(migrateDatabase('cell', url, modules)).rejects.toThrow(
    'Fixture dependency'
  );
  const db = fixture.owner(url);
  expect(
    await db.one("SELECT to_regclass('cell.first_probe') IS NOT NULL AS exists")
  ).toEqual({ exists: true });
  expect(
    await db.one("SELECT to_regclass('reference.first_probe') AS name")
  ).toEqual({ name: null });
  expect(
    await db.one("SELECT to_regclass('app.schema_migrations') AS name")
  ).toEqual({ name: null });
  unavailable = false;
  await migrateDatabase('cell', url, modules);
  expect(
    await db.one(
      'SELECT count(*)::int AS count FROM reference.schema_migrations'
    )
  ).toEqual({ count: 2 });
});
it('runs compiled CLI targets with only their selected credentials and safe failures', () => {
  const script = fileURLToPath(
    new URL('../../dist/scripts/migrate.js', import.meta.url)
  );
  const run = (args: string[], extra: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, [script, ...args], {
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        ADMIN_MIGRATION_URL_TEST: '',
        CELL_MIGRATION_URL_TEST: '',
        ...extra,
      },
      encoding: 'utf8',
      timeout: 10000,
    });
  expect(
    run(['--target', 'admin'], { ADMIN_MIGRATION_URL_TEST: fixture.adminUrl })
      .status
  ).toBe(0);
  expect(
    run(['--target', 'cell'], { CELL_MIGRATION_URL_TEST: fixture.cellUrl })
      .status
  ).toBe(0);
  for (const args of [
    [],
    ['--target', 'unknown'],
    ['--target', 'admin', 'extra'],
  ])
    expect(run(args).status).toBe(1);
  const invalid = run(['--target', 'admin'], {
    ADMIN_MIGRATION_URL_TEST: 'private-invalid-value',
  });
  expect(invalid.status).toBe(1);
  expect(invalid.stderr).not.toContain('private-invalid-value');
});
it('backs up and restores each target without changing the other database', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nap-foundation-dump-'));
  try {
    for (const [target, url, otherUrl] of [
      ['admin', fixture.adminUrl, fixture.cellUrl],
      ['cell', fixture.cellUrl, fixture.adminUrl],
    ] as const) {
      await migrateDatabase(target, url, [module(target, [first])]);
      await fixture
        .owner(url)
        .none('INSERT INTO $1:name.first_probe (id) VALUES (41)', [target]);
      const before = await fixture
        .owner(otherUrl)
        .any('SELECT nspname FROM pg_namespace ORDER BY nspname');
      const restored = await fixture.createDatabase(`restored_${target}`);
      const dump = join(directory, `${target}.dump`);
      fixture.pgTool('pg_dump', ['-Fc', '-f', dump], url);
      fixture.pgTool(
        'pg_restore',
        [
          '--exit-on-error',
          '--no-owner',
          '-d',
          new URL(restored).pathname.slice(1),
          dump,
        ],
        restored
      );
      const schemas = target === 'admin' ? ['admin'] : CELL_SCHEMAS;
      for (const schema of schemas) {
        expect(
          await fixture
            .owner(restored)
            .one(
              'SELECT count(*)::int AS count FROM $1:name.schema_migrations',
              [schema]
            )
        ).toEqual({ count: schema === target ? 1 : 0 });
      }
      expect(
        await fixture
          .owner(restored)
          .any('SELECT id FROM $1:name.first_probe', [target])
      ).toEqual([{ id: 41 }]);
      expect(
        await fixture
          .owner(otherUrl)
          .any('SELECT nspname FROM pg_namespace ORDER BY nspname')
      ).toEqual(before);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
