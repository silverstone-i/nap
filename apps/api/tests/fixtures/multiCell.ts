/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { authDatabase, authEnv } from './authDatabase.js';
import { createCellDatabase } from '../../src/db/cell/index.js';
import { cellRepositories } from '../../src/db/cell/repositories.js';
import { createAdminDatabase } from '../../src/db/admin/index.js';
import { adminRepositories } from '../../src/db/admin/repositories.js';
import { migrateDatabase } from '../../src/db/migrate.js';
import { cellModules } from '../../src/db/cell/modules.js';

/**
 * Does: Reserves a currently unused loopback port for a test process.
 * Called by: multiCell before launching each API process.
 */
async function port() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test port');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}

/**
 * Does: Starts the built API with isolated test configuration and exposes restartable process controls.
 * Called by: multiCell for each cell and its admin-only router.
 * Why: process output is suppressed so generated database credentials cannot enter test diagnostics.
 */
async function apiProcess(env: NodeJS.ProcessEnv) {
  const listen = await port();
  const origin = `http://127.0.0.1:${listen}`;
  let child: ReturnType<typeof spawn> | undefined;
  /**
   * Does: Starts the compiled API process and waits until it can serve requests.
   * Called by: apiProcess during setup and acceptance tests when restarting a stopped process.
   */
  async function start() {
    child = spawn(
      process.execPath,
      [fileURLToPath(new URL('../../dist/server.js', import.meta.url))],
      {
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'test',
          PORT: String(listen),
          ...authEnv,
          ...env,
        },
        stdio: 'ignore',
      }
    );
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null)
        throw new Error('Test API exited before readiness');
      try {
        if ((await fetch(origin + '/health/ready')).ok) return;
      } catch {
        /* The process has not opened its listener yet. */
      }
      await delay(100);
    }
    throw new Error('Test API readiness deadline exceeded');
  }
  /**
   * Does: Stops the test API process and waits for its database connections to close.
   * Called by: apiProcess on startup failure, fixture cleanup, and acceptance tests simulating an outage.
   */
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child?.kill('SIGKILL'), 12000);
    try {
      await exited;
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    await start();
  } catch (error) {
    await stop();
    throw error;
  }
  return { origin, start, stop };
}

/**
 * Does: Builds two separately credentialed databases and three processes from the same API artifact.
 * Called by: multi-cell acceptance tests and disposable browser verification.
 */
export async function multiCell() {
  const base = await authDatabase();
  const processes: Awaited<ReturnType<typeof apiProcess>>[] = [];
  const url2 = await base.fixture.createDatabase('cell_two');
  const role2 = await base.fixture.createRole('cell_two');
  const routerRole = await base.fixture.createRole('router');
  const cell2 = createCellDatabase(base.fixture.runtimeUrl(url2, role2), {
    repositories: cellRepositories,
  });
  /**
   * Does: Closes the test processes and database connections before deleting their temporary resources.
   * Called by: multiCell on setup failure and acceptance tests during suite cleanup.
   */
  async function cleanup() {
    await Promise.all(processes.map(p => p.stop()));
    await cell2.close();
    await base.cleanup();
  }
  try {
    await migrateDatabase('cell', url2, cellModules);
    const owner2 = createCellDatabase(url2, { repositories: cellRepositories });
    const adminOwner = createAdminDatabase(base.fixture.adminUrl, {
      repositories: adminRepositories,
    });
    try {
      await owner2.db.employees.grantRuntime(role2);
      await adminOwner.db.tenants.grantRuntime(role2);
      await adminOwner.db.tenants.grantRuntime(routerRole);
    } finally {
      await Promise.all([owner2.close(), adminOwner.close()]);
    }
    // Database CONNECT grants prove the credentials cannot reach another deployment's data.
    for (const [url, roles] of [
      [base.fixture.cellUrl, [base.fixture.role]],
      [url2, [role2]],
      [base.fixture.adminUrl, [base.fixture.role, role2, routerRole]],
    ] as const) {
      const database = new URL(url).pathname.slice(1);
      await base.fixture.control.none(
        'REVOKE CONNECT ON DATABASE $1:name FROM PUBLIC',
        [database]
      );
      for (const role of roles)
        await base.fixture.control.none(
          'GRANT CONNECT ON DATABASE $1:name TO $2:name',
          [database, role]
        );
    }
    const one = await apiProcess({
      API_MODE: 'cell',
      CELL_CODE: 'cell-1',
      ADMIN_DATABASE_URL_TEST: base.fixture.runtimeUrl(base.fixture.adminUrl),
      CELL_DATABASE_URL_TEST: base.fixture.runtimeUrl(base.fixture.cellUrl),
    });
    processes.push(one);
    const two = await apiProcess({
      API_MODE: 'cell',
      CELL_CODE: 'cell-2',
      ADMIN_DATABASE_URL_TEST: base.fixture.runtimeUrl(
        base.fixture.adminUrl,
        role2
      ),
      CELL_DATABASE_URL_TEST: base.fixture.runtimeUrl(url2, role2),
    });
    processes.push(two);
    const router = await apiProcess({
      API_MODE: 'router',
      ADMIN_DATABASE_URL_TEST: base.fixture.runtimeUrl(
        base.fixture.adminUrl,
        routerRole
      ),
      CELL_API_ORIGINS: JSON.stringify({
        'cell-1': one.origin,
        'cell-2': two.origin,
      }),
    });
    processes.push(router);
    return {
      ...base,
      cell2,
      url2,
      role2,
      routerRole,
      one,
      two,
      router,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
