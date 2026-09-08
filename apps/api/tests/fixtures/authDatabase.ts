/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createServer } from 'node:http';
import { once } from 'node:events';
import { postgresFixture } from './postgres.js';
import { createAdminDatabase } from '../../src/db/admin/index.js';
import { adminModules } from '../../src/db/admin/modules.js';
import { adminRepositories } from '../../src/db/admin/repositories.js';
import { createCellDatabase } from '../../src/db/cell/index.js';
import { migrateDatabase } from '../../src/db/migrate.js';
import { authConfiguration } from '../../src/util/authConfig.js';
import {
  bootstrapConfiguration,
  bootstrapRoot,
} from '../../src/services/bootstrap.js';
import { createApp } from '../../src/app.js';

/**
 * Does: Supplies private test-only bootstrap values and cookie keys.
 * Used by: disposable authentication fixtures and configuration tests.
 */
export const authEnv = {
  SESSION_SECRET: 'a'.repeat(64),
  AUTH_THROTTLE_SECRET: 'b'.repeat(64),
  COOKIE_SECURE: 'false',
  ROOT_TENANT_CODE: 'NAP',
  ROOT_COMPANY: 'Operator',
  ROOT_EMAIL: 'root@nap.test',
  ROOT_PASSWORD: 'a-long-test-password',
};

/**
 * Does: Migrates and seeds a disposable database and serves it through the real auth routes.
 * Called by: authentication integration suites; cleanup touches only fixture resources.
 */
export async function authDatabase() {
  const fixture = await postgresFixture();
  const admin = createAdminDatabase(fixture.runtimeUrl(fixture.adminUrl), {
    repositories: adminRepositories,
  });
  const cell = createCellDatabase(fixture.runtimeUrl(fixture.cellUrl));
  try {
    await migrateDatabase('admin', fixture.adminUrl, adminModules);
    const owner = fixture.owner(fixture.adminUrl);
    const grantDb = createAdminDatabase(fixture.adminUrl, {
      repositories: adminRepositories,
    });
    try {
      await grantDb.db.tenants.grantRuntime(fixture.role);
    } finally {
      await grantDb.close();
    }
    const config = authConfiguration(authEnv);
    const root = await bootstrapRoot(
      admin,
      bootstrapConfiguration(authEnv, [])
    );
    const app = createApp(undefined, { admin, cell }, { auth: config });
    const server = createServer(app);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return {
      server,
      fixture,
      owner,
      admin,
      cell,
      config,
      root,
      app,
      /** Does: Closes the application pools before disposing of the private database cluster. */
      async cleanup() {
        await new Promise<void>((resolve, reject) =>
          server.close(error => (error ? reject(error) : resolve()))
        );
        await Promise.all([admin.close(), cell.close()]);
        await fixture.cleanup();
      },
    };
  } catch (error) {
    await Promise.all([admin.close(), cell.close()]);
    await fixture.cleanup();
    throw error;
  }
}
