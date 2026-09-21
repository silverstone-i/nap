/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FIRST_PORT = 5433;
const START_TIMEOUT_MS = 15_000;
const COMMAND_TIMEOUT_MS = 30_000;
// Force a plain locale: an empty/unset LANG on macOS can crash postgres at
// startup with "postmaster became multithreaded during startup".
const PG_ENV = { ...process.env, LC_ALL: 'C', LANG: 'C' };
// Matches CI's postgres:18 service (POSTGRES_PASSWORD). Real password
// checking (not --auth=trust) matters: some integration tests assert that
// wrong-password requests are rejected.
const FIXTURE_PASSWORD = 'fixture-postgres';

/**
 * Resolve the directory containing the Postgres server binaries, preferring
 * `pg_config` (works across Homebrew, apt, and other installs) and falling
 * back to whatever `initdb`/`pg_ctl` resolve to on PATH.
 */
function resolveBinDir() {
  const pgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
  if (pgConfig.status === 0) return pgConfig.stdout.trim();
  return '';
}

function bin(dir, name) {
  return dir ? join(dir, name) : name;
}

/** Find a free TCP port on 127.0.0.1, starting from `from`. */
async function findFreePort(from) {
  for (let port = from; port < from + 100; port++) {
    const free = await new Promise(resolve => {
      const server = createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true));
      });
    });
    if (free) return port;
  }
  throw new Error(`No free port found starting at ${from}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: PG_ENV,
    timeout: COMMAND_TIMEOUT_MS,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.signal === 'SIGTERM')
    throw new Error(
      `${command} timed out after ${COMMAND_TIMEOUT_MS}ms and was killed`
    );
  return result;
}

async function waitForReady(binDir, port, dataDir) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  for (;;) {
    const check = run(bin(binDir, 'pg_isready'), [
      '-h',
      '127.0.0.1',
      '-p',
      String(port),
    ]);
    if (check.status === 0) return;
    if (Date.now() > deadline) {
      const log = await readFile(join(dataDir, 'log'), 'utf8').catch(
        () => '(no log)'
      );
      throw new Error(
        `Postgres did not become ready within ${START_TIMEOUT_MS}ms:\n${log}`
      );
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

/**
 * Provision a disposable local PostgreSQL 18 cluster, run `npm run test:db`
 * against it, and tear the cluster down afterward. Mirrors CI's disposable
 * `postgres:18` service container without requiring Docker.
 * @returns {Promise<number>} The exit code of `npm run test:db`.
 */
export async function runLocalDatabaseTests(
  root = new URL('../', import.meta.url)
) {
  const binDir = resolveBinDir();
  const dataDir = await mkdtemp(join(tmpdir(), 'nap-test-db-'));
  const pwFileDir = await mkdtemp(join(tmpdir(), 'nap-test-db-pw-'));
  const port = await findFreePort(FIRST_PORT);
  let started = false;

  const cleanup = async () => {
    if (started) {
      run(bin(binDir, 'pg_ctl'), ['-D', dataDir, '-m', 'fast', 'stop']);
    }
    await Promise.all([
      rm(dataDir, { recursive: true, force: true }),
      rm(pwFileDir, { recursive: true, force: true }),
    ]);
  };

  const onSignal = () => {
    cleanup().finally(() => process.exit(1));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    const pwFile = join(pwFileDir, 'pwfile');
    await writeFile(pwFile, `${FIXTURE_PASSWORD}\n`, { mode: 0o600 });

    const initdb = run(bin(binDir, 'initdb'), [
      '-D',
      dataDir,
      '-U',
      'postgres',
      '--auth=scram-sha-256',
      '--pwfile',
      pwFile,
      '--no-sync',
    ]);
    if (initdb.status !== 0)
      throw new Error(`initdb failed:\n${initdb.stderr}`);

    const start = run(bin(binDir, 'pg_ctl'), [
      '-D',
      dataDir,
      '-o',
      `-p ${port} -c listen_addresses=127.0.0.1`,
      '-l',
      join(dataDir, 'log'),
      'start',
    ]);
    if (start.status !== 0) {
      const log = await readFile(join(dataDir, 'log'), 'utf8').catch(
        () => '(no log)'
      );
      throw new Error(
        `pg_ctl start failed:\n${start.stdout}${start.stderr}\n${log}`
      );
    }
    started = true;

    await waitForReady(binDir, port, dataDir);

    const url = `postgresql://postgres:${FIXTURE_PASSWORD}@127.0.0.1:${port}/postgres`;
    console.log(
      `Disposable PostgreSQL 18 cluster ready at postgresql://postgres:***@127.0.0.1:${port}/postgres`
    );

    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn('npm', ['run', 'test:db'], {
        cwd: fileURLToPath(root),
        stdio: 'inherit',
        env: { ...process.env, FOUNDATION_TEST_URL: url },
      });
      child.on('error', reject);
      child.on('exit', code => resolve(code ?? 1));
    });
    return exitCode;
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await cleanup();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = await runLocalDatabaseTests();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Local database tests failed'
    );
    process.exitCode = 1;
  }
}
