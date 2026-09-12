/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { authDatabase } from './authDatabase.js';
import { createCellDatabase } from '../../src/db/cell/index.js';
import { cellRepositories } from '../../src/db/cell/repositories.js';
import { migrateDatabase } from '../../src/db/migrate.js';
import { cellModules } from '../../src/db/cell/modules.js';
import { createRuntime } from '../../src/runtime.js';
import { createCellRegistry } from '../../src/services/cellRegistry.js';
import { createAuthorizationCache } from '../../src/db/redis.js';
import { resolveCacheConfiguration } from '../../src/util/env.js';

/**
 * Does: Starts one API with two independently credentialed databases and central admin.
 * Called by: multi-cell acceptance tests and disposable browser verification.
 */
export async function multiCell(
  cacheEnv: NodeJS.ProcessEnv = {},
  initiallyUnavailable = false
) {
  const base = await authDatabase();
  await new Promise<void>((resolve, reject) =>
    base.server.close(error => (error ? reject(error) : resolve()))
  );
  const url2 = await base.fixture.createDatabase('cell_two');
  const role2 = await base.fixture.createRole('cell_two');
  const cell2 = createCellDatabase(base.fixture.runtimeUrl(url2, role2), {
    repositories: cellRepositories,
  });
  let runtime: ReturnType<typeof createRuntime> | undefined;
  const cacheConfiguration = resolveCacheConfiguration({
    NODE_ENV: 'test',
    ...cacheEnv,
  });
  const cache = cacheConfiguration.url
    ? createAuthorizationCache({
        ...cacheConfiguration,
        url: cacheConfiguration.url,
      })
    : undefined;
  /** Does: Closes the single API and all pools before deleting fixture databases. */
  async function cleanup() {
    await runtime?.shutdown();
    await cell2.close();
    await base.cleanup();
  }
  try {
    await migrateDatabase('cell', url2, cellModules);
    const owner2 = createCellDatabase(url2, { repositories: cellRepositories });
    try {
      await owner2.db.employees.grantRuntime(role2);
    } finally {
      await owner2.close();
    }
    const second = await base.admin.db.cells.insert({
      code: 'cell-2',
      name: 'Second cell',
      enabled: true,
    });
    for (const [url, role] of [
      [base.fixture.cellUrl, base.fixture.role],
      [url2, role2],
    ]) {
      const database = new URL(url).pathname.slice(1);
      await base.fixture.control.none(
        'REVOKE CONNECT ON DATABASE $1:name FROM PUBLIC',
        [database]
      );
      await base.fixture.control.none(
        'GRANT CONNECT ON DATABASE $1:name TO $2:name',
        [database, role]
      );
    }
    if (cache) {
      base.admin.authorizationCache = { cache, database: 'admin' };
      base.cell.authorizationCache = { cache, database: base.cellId };
      cell2.authorizationCache = { cache, database: second.id };
    }
    const cells = createCellRegistry(
      new Map([
        [base.cellId, base.cell],
        [second.id, cell2],
      ])
    );
    if (initiallyUnavailable)
      await base.fixture.control.none('ALTER ROLE $1:name NOLOGIN', [role2]);
    runtime = createRuntime(
      { admin: base.admin, cells },
      { auth: base.config, cache }
    );
    await runtime.start(0);
    const address = runtime.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing test address');
    const api = { origin: `http://127.0.0.1:${address.port}` };
    const database2 = {
      /** Does: Simulates a database outage by refusing and terminating runtime connections. */
      async stop() {
        await base.fixture.control.none('ALTER ROLE $1:name NOLOGIN', [role2]);
        await base.fixture.control.any(
          'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename=$1',
          [role2]
        );
        await cells.check();
      },
      /** Does: Restores runtime access and probes recovery without restarting the API. */
      async start() {
        await base.fixture.control.none('ALTER ROLE $1:name LOGIN', [role2]);
        await cells.check();
      },
    };
    return {
      ...base,
      cells,
      runtime,
      cell2,
      cell2Id: second.id,
      url2,
      role2,
      api,
      database2,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
