/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { createDb } from 'pg-schemata';
import type { Database } from 'pg-schemata';
import { resolveSetupConfiguration } from '../../src/util/env.js';

/** Run fixture tooling with private diagnostics; subprocess errors may contain secrets. */
function command(
  program: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env
) {
  const result = spawnSync(program, args, {
    env,
    encoding: 'utf8',
    timeout: 30000,
  });
  if (result.error || result.status !== 0)
    throw new Error(`PostgreSQL fixture command failed: ${program}`);
  return result.stdout;
}

/**
 * Create a private local cluster or unique databases on CI's disposable service.
 * Never load the developer's .env or operate on configured application databases.
 * Generated roles/databases are the only objects removed by cleanup.
 */
export async function postgresFixture() {
  const id = randomBytes(6).toString('hex');
  let directory: string | undefined;
  let started = false;
  const databases: string[] = [];
  const roles: string[] = [];
  const handles: Database[] = [];
  let setup: {
    host: string;
    port: string;
    user: string;
    password: string;
    database: string;
  };
  let control: Database | undefined;
  const cleanup = async () => {
    try {
      const closed = await Promise.allSettled(handles.map(db => db.close()));
      if (closed.some(result => result.status === 'rejected'))
        throw new Error('Failed to close PostgreSQL fixture handles');
      if (control) {
        // Pool shutdown can finish before PostgreSQL has processed every socket
        // closure. FORCE can terminate a disconnecting session and deliver an
        // unhandled 57P01 to a closing pool. Use ordinary DROP so connections
        // finish normally and a genuine leaked session fails cleanup.
        for (const name of databases)
          await control.none('DROP DATABASE IF EXISTS $1:name', [name]);
        for (const name of roles)
          await control.none('DROP ROLE IF EXISTS $1:name', [name]);
      }
    } finally {
      await control?.close();
      if (started && directory)
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
  };
  try {
    if (process.env.CI) {
      setup = resolveSetupConfiguration('test').setup;
    } else {
      directory = mkdtempSync(join(tmpdir(), 'nap-foundation-pg-'));
      const password = randomBytes(20).toString('hex');
      const passwordFile = join(directory, 'password');
      writeFileSync(passwordFile, password, { mode: 0o600 });
      const probe = createServer();
      await new Promise<void>((resolve, reject) => {
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', resolve);
      });
      const address = probe.address();
      if (!address || typeof address === 'string')
        throw new Error('No fixture port');
      const port = String(address.port);
      await new Promise<void>(resolve => probe.close(() => resolve()));
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
        `-h 127.0.0.1 -p ${port} -k ${directory}`,
        '-w',
        'start',
      ]);
      started = true;
      setup = {
        host: '127.0.0.1',
        port,
        user: 'nap_admin',
        password,
        database: 'postgres',
      };
    }
    const url = (
      database: string,
      user = setup.user,
      password = setup.password
    ) =>
      `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${setup.host}:${setup.port}/${database}`;
    control = createDb({ connectionString: url(setup.database) });
    const version = await control.one<{ version: number }>(
      "SELECT current_setting('server_version_num')::int AS version"
    );
    if (version.version < 180000)
      throw new Error('PostgreSQL 18 or later is required');
    const createDatabase = async (label: string) => {
      const name = `nap_${label}_${id}`;
      await control!.none('CREATE DATABASE $1:name', [name]);
      databases.push(name);
      return url(name);
    };
    const createRole = async (label: string) => {
      const name = `nap_${label}_${id}`;
      await control!.none('CREATE ROLE $1:name LOGIN NOINHERIT PASSWORD $2', [
        name,
        setup.password,
      ]);
      roles.push(name);
      return name;
    };
    const adminUrl = await createDatabase('admin');
    const cellUrl = await createDatabase('cell');
    const role = await createRole('runtime');
    const runtimeUrl = (ownerUrl: string, username = role) => {
      const parsed = new URL(ownerUrl);
      parsed.username = username;
      return parsed.toString();
    };
    const owner = (connectionString: string) => {
      const db = createDb({ connectionString });
      handles.push(db);
      return db;
    };
    return {
      adminUrl,
      cellUrl,
      role,
      control,
      createDatabase,
      createRole,
      owner,
      runtimeUrl,
      env: {
        NODE_ENV: 'test',
        ADMIN_DATABASE_URL_TEST: runtimeUrl(adminUrl),
        CELL_DATABASE_URL_TEST: runtimeUrl(cellUrl),
      },
      /** Execute dump/restore with credentials in the child environment only. */
      pgTool(program: string, args: string[], connectionString: string) {
        const parsed = new URL(connectionString);
        return command(program, args, {
          PATH: process.env.PATH,
          PGHOST: parsed.hostname,
          PGPORT: parsed.port,
          PGUSER: decodeURIComponent(parsed.username),
          PGPASSWORD: decodeURIComponent(parsed.password),
          PGDATABASE: parsed.pathname.slice(1),
          PGCONNECT_TIMEOUT: '5',
        });
      },
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
