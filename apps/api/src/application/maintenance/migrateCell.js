/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  cellModules,
  cellSchemas,
  validateCellRegistry,
} from '../../modules/cell.js';
import { createCellDatabase } from '../../infrastructure/runtime/cellDatabase.js';
import { verifyDatabase } from '../../infrastructure/provisioning/postgres.js';
import { verifyCell } from '../../modules/cell-tenancy/schema/verify.js';
import { roleUrl } from '../shared/configuration.js';
/**
 * Apply pending cell migrations to one cell database as `nap-admin`, one
 * schema at a time in `cellSchemas` order, then verify the installed
 * contract. Cell provisioning calls this; runtime startup never does.
 * Connections close on success and failure.
 * @param {{endpoint: string, adminPassword: string, database: string}} config
 * @param {object[]} [modules=cellModules]
 * @returns {Promise<{status: 'applied'|'unchanged', database: string}>}
 * @throws {MaintenanceError} From registry validation, database verification, or contract verification.
 */
export async function migrateCell(config, modules = cellModules) {
  validateCellRegistry(modules);
  const handle = createCellDatabase(
    roleUrl(config.endpoint, 'nap-admin', config.adminPassword)
  );
  try {
    await handle.connect();
    await verifyDatabase(handle.db, config.database);
    let applied = 0;
    for (const schema of cellSchemas) {
      const scoped = modules.filter(m => m.schema === schema);
      if (!scoped.length) continue;
      const result = await handle.migrate({ schema, modules: scoped });
      applied += result.applied.length;
    }
    await verifyCell(handle, modules);
    return {
      status: applied ? 'applied' : 'unchanged',
      database: config.database,
    };
  } finally {
    await handle.close();
  }
}
