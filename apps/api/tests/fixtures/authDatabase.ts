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
import { cellRepositories } from '../../src/db/cell/repositories.js';
import { cellModules } from '../../src/db/cell/modules.js';
import { createCellDatabase } from '../../src/db/cell/index.js';
import { migrateDatabase } from '../../src/db/migrate.js';
import { authConfiguration } from '../../src/util/authConfig.js';
import {
  bootstrapConfiguration,
  bootstrapRoot,
} from '../../src/services/bootstrap.js';
import { createCellRegistry } from '../../src/services/cellRegistry.js';
import {
  claimOperatorCell,
  completeOperatorBootstrap,
} from '../../src/services/operatorBootstrap.js';
import { withAdminTransaction } from '../../src/db/withAdminTransaction.js';
import { createApp } from '../../src/app.js';

/**
 * Does: Supplies private test-only bootstrap values and cookie keys.
 * Used by: disposable authentication fixtures and configuration tests.
 */
export const authEnv = {
  NODE_ENV: 'test',
  SESSION_SECRET_TEST: 'a'.repeat(64),
  AUTH_THROTTLE_SECRET_TEST: 'b'.repeat(64),
  COOKIE_SECURE_TEST: 'false',
  ROOT_TENANT_CODE_TEST: 'NAP',
  ROOT_COMPANY_TEST: 'Operator',
  ROOT_EMAIL_TEST: 'root@nap.test',
  ROOT_PASSWORD_TEST: 'a-long-test-password',
};

/**
 * Does: Migrates and seeds a disposable database and serves it through the real auth routes.
 * Called by: authentication integration suites; cleanup touches only fixture resources.
 */
export async function authDatabase(completeBootstrap = true) {
  const fixture = await postgresFixture();
  const admin = createAdminDatabase(fixture.runtimeUrl(fixture.adminUrl), {
    repositories: adminRepositories,
  });
  const cell = createCellDatabase(fixture.runtimeUrl(fixture.cellUrl), {
    repositories: cellRepositories,
  });
  try {
    await migrateDatabase('admin', fixture.adminUrl, adminModules);
    await migrateDatabase('cell', fixture.cellUrl, cellModules);
    const cellOwner = createCellDatabase(fixture.cellUrl, {
      repositories: cellRepositories,
    });
    try {
      await cellOwner.db.employees.grantRuntime(fixture.role);
    } finally {
      await cellOwner.close();
    }
    const owner = fixture.owner(fixture.adminUrl);
    const grantDb = createAdminDatabase(fixture.adminUrl, {
      repositories: adminRepositories,
    });
    try {
      await grantDb.db.tenants.grantRuntime(fixture.role);
    } finally {
      await grantDb.close();
    }
    await owner.none(
      'GRANT SELECT,INSERT,UPDATE ON admin.cell_provisioning,admin.operator_bootstrap TO $1:name',
      [fixture.role]
    );
    const config = authConfiguration(authEnv);
    const root = await bootstrapRoot(
      admin,
      bootstrapConfiguration(authEnv, [])
    );
    const registered = await owner.one<{ id: string }>(
      "INSERT INTO admin.cells(database_name,enabled) VALUES('cell-1',true) RETURNING id"
    );
    const cells = createCellRegistry(new Map([[registered.id, cell]]));
    await cells.check();
    if (completeBootstrap) {
      await withAdminTransaction(admin, tx =>
        claimOperatorCell(tx, registered.id)
      );
      await completeOperatorBootstrap(admin, cells);
    }
    const app = createApp(undefined, { admin, cells }, { auth: config });
    const server = createServer(app);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return {
      server,
      fixture,
      owner,
      admin,
      cell,
      cells,
      cellId: registered.id,
      config,
      root,
      app,
      /** Does: Closes the application pools before disposing of the private database cluster. */
      async cleanup() {
        cells.stop();
        if (server.listening)
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
