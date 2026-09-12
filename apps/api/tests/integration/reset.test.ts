/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { postgresFixture } from '../fixtures/postgres.js';
import { migrateDatabase } from '../../src/db/migrate.js';
import { resetDatabase } from '../../src/db/reset.js';
import { adminModules } from '../../src/db/admin/modules.js';
import { cellModules } from '../../src/db/cell/modules.js';
import { CELL_SCHEMAS } from '../../src/db/modules.js';

let fixture: Awaited<ReturnType<typeof postgresFixture>>;
beforeAll(async () => {
  fixture = await postgresFixture();
  await migrateDatabase('admin', fixture.adminUrl, adminModules);
  await migrateDatabase('cell', fixture.cellUrl, cellModules);
}, 30000);
afterAll(async () => {
  await fixture?.cleanup();
}, 30000);

it.each(['admin', 'cell'] as const)(
  'resets %s schemas and migration history while preserving other databases and roles',
  async target => {
    const url = target === 'admin' ? fixture.adminUrl : fixture.cellUrl;
    const schemas = target === 'admin' ? ['admin'] : [...CELL_SCHEMAS];
    const modules = target === 'admin' ? adminModules : cellModules;
    const db = fixture.owner(url);
    const other = fixture.owner(
      target === 'admin' ? fixture.cellUrl : fixture.adminUrl
    );
    const before = await db.any(
      'SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = ANY($1) ORDER BY 1, 2',
      [schemas]
    );
    expect(before.length).toBeGreaterThan(0);
    const otherBefore = await other.any(
      "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY 1, 2"
    );
    await db.none('CREATE TABLE public.reset_sentinel (id integer)');
    await db.none('INSERT INTO public.reset_sentinel VALUES (1)');

    // A missing acknowledgement must refuse before connecting or dropping data.
    const refused = spawnSync(
      process.execPath,
      ['dist/scripts/reset.js', '--target', target],
      {
        env: {
          ...process.env,
          ...fixture.env,
          CELL_DATABASES_TEST: JSON.stringify({
            '00000000-0000-4000-8000-000000000001':
              new URL(fixture.cellUrl).host + new URL(fixture.cellUrl).pathname,
          }),
        },
        encoding: 'utf8',
        timeout: 10000,
      }
    );
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('--confirm');
    expect(
      await db.any(
        'SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = ANY($1) ORDER BY 1, 2',
        [schemas]
      )
    ).toEqual(before);

    const result = spawnSync(
      process.execPath,
      [
        'dist/scripts/reset.js',
        '--target',
        target,
        ...(target === 'cell'
          ? ['--cell-id', '00000000-0000-4000-8000-000000000001']
          : []),
        '--confirm',
      ],
      {
        env: {
          ...process.env,
          ...fixture.env,
          CELL_DATABASES_TEST: JSON.stringify({
            '00000000-0000-4000-8000-000000000001':
              new URL(fixture.cellUrl).host + new URL(fixture.cellUrl).pathname,
          }),
        },
        encoding: 'utf8',
        timeout: 10000,
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`${target} TEST reset complete`);
    expect(
      await db.any('SELECT nspname FROM pg_namespace WHERE nspname = ANY($1)', [
        schemas,
      ])
    ).toEqual([]);
    expect(await db.one('SELECT id FROM public.reset_sentinel')).toEqual({
      id: 1,
    });
    expect(
      await other.any(
        "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY 1, 2"
      )
    ).toEqual(otherBefore);
    expect(
      await fixture.control.one(
        'SELECT count(*)::int AS count FROM pg_roles WHERE rolname = $1',
        [fixture.role]
      )
    ).toEqual({ count: 1 });

    await resetDatabase(target, url);
    await migrateDatabase(target, url, modules);
    expect(
      await db.any(
        'SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = ANY($1) ORDER BY 1, 2',
        [schemas]
      )
    ).toEqual(before);
    await db.none('DROP TABLE public.reset_sentinel');
  },
  30000
);
