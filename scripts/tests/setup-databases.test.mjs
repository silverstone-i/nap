/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { resolveSetupConfiguration } from '../../apps/api/src/util/env.ts';
import { setupDatabases } from '../setup-databases.mjs';

let directory;
let configuration;
let started = false;
const suffix = randomBytes(6).toString('hex');
const names = {
  role: `nap_test_role_${suffix}`,
  admin: `nap_test_admin_${suffix}`,
  cell: `nap_test_cell_${suffix}`,
};
function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    encoding: 'utf8',
    timeout: 15000,
    ...options,
  });
  if (result.status !== 0 || result.error)
    throw new Error(`Test fixture command failed: ${program}`);
  return result.stdout.trim();
}
function sql(statement) {
  const c = configuration.setup;
  return command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    env: {
      PATH: process.env.PATH,
      PGHOST: c.host,
      PGPORT: c.port,
      PGUSER: c.user,
      PGPASSWORD: c.password,
      PGDATABASE: c.database,
      PGCONNECT_TIMEOUT: '5',
    },
    input: statement,
  });
}
beforeAll(() => {
  let setup;
  if (process.env.CI) {
    setup = resolveSetupConfiguration('test').setup;
  } else {
    directory = mkdtempSync(join(tmpdir(), 'nap-toolchain-pg-'));
    const password = randomBytes(16).toString('hex');
    const passwordFile = join(directory, 'password');
    writeFileSync(passwordFile, password, { mode: 0o600 });
    command('initdb', [
      '-D',
      join(directory, 'data'),
      '-U',
      'nap_admin',
      '--auth=scram-sha-256',
      `--pwfile=${passwordFile}`,
    ]);
    command('pg_ctl', [
      '-D',
      join(directory, 'data'),
      '-l',
      join(directory, 'server.log'),
      '-o',
      `-h '' -k ${directory}`,
      '-w',
      'start',
    ]);
    started = true;
    setup = {
      host: directory,
      port: '5432',
      user: 'nap_admin',
      password,
      database: 'postgres',
    };
  }
  configuration = {
    setup,
    targets: [names.admin, names.cell].map(database => ({
      ...setup,
      database,
      user: names.role,
      owner: setup.user,
      password: randomBytes(16).toString('hex'),
    })),
  };
  configuration.targets[1].password = configuration.targets[0].password;
}, 30000);
afterAll(() => {
  try {
    if (configuration) {
      sql(
        `DROP DATABASE IF EXISTS "${names.admin}"; DROP DATABASE IF EXISTS "${names.cell}"; DROP ROLE IF EXISTS "${names.role}";`
      );
    }
  } finally {
    if (started)
      command('pg_ctl', [
        '-D',
        join(directory, 'data'),
        '-m',
        'fast',
        '-w',
        'stop',
      ]);
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});
it('creates isolated databases and a safe runtime role; repeat setup preserves passwords and data', () => {
  setupDatabases(configuration);
  const password = sql(
    `SELECT rolpassword FROM pg_authid WHERE rolname = '${names.role}';`
  );
  sql(`COMMENT ON DATABASE "${names.admin}" IS 'preserved';`);
  setupDatabases(configuration);
  expect(
    sql(`SELECT rolpassword FROM pg_authid WHERE rolname = '${names.role}';`)
  ).toBe(password);
  expect(
    sql(
      `SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = '${names.admin}';`
    )
  ).toBe('preserved');
  expect(
    sql(
      `SELECT rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname = '${names.role}';`
    )
  ).toBe('f');
  expect(
    sql(
      `SELECT count(*) FROM pg_database WHERE datname IN ('${names.admin}', '${names.cell}') AND pg_get_userbyid(datdba) = '${configuration.setup.user}';`
    )
  ).toBe('2');
});
it('rejects unsafe existing runtime roles', () => {
  sql(`ALTER ROLE "${names.role}" BYPASSRLS;`);
  try {
    expect(() => setupDatabases(configuration)).toThrow(
      'incompatible privileges'
    );
  } finally {
    sql(`ALTER ROLE "${names.role}" NOBYPASSRLS;`);
  }
});
it('rejects role membership, ownership, and incompatible credentials without repair', () => {
  sql(`GRANT "${configuration.setup.user}" TO "${names.role}";`);
  try {
    expect(() => setupDatabases(configuration)).toThrow(
      'incompatible privileges'
    );
  } finally {
    sql(`REVOKE "${configuration.setup.user}" FROM "${names.role}";`);
  }
  sql(`ALTER DATABASE "${names.admin}" OWNER TO "${names.role}";`);
  try {
    expect(() => setupDatabases(configuration)).toThrow(
      'incompatible privileges'
    );
  } finally {
    sql(
      `ALTER DATABASE "${names.admin}" OWNER TO "${configuration.setup.user}";`
    );
  }
  const wrong = {
    ...configuration,
    targets: configuration.targets.map(t => ({ ...t, password: 'incorrect' })),
  };
  expect(() => setupDatabases(wrong)).toThrow('Database setup command failed');
});

it('refuses an incompatible database owner before changing anything', () => {
  const wrong = {
    ...configuration,
    targets: configuration.targets.map(t => ({
      ...t,
      owner: 'different_owner',
    })),
  };
  expect(() => setupDatabases(wrong)).toThrow('incompatible ownership');
});
