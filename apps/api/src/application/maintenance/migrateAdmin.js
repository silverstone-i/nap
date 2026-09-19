/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { adminModules, validateAdminRegistry } from '../../modules/admin.js';
import { createAdminDatabase } from '../../infrastructure/runtime/adminDatabase.js';
import { verifyDatabase } from '../../infrastructure/provisioning/postgres.js';
import { verifyAdmin } from '../../modules/admin-tenancy/schema/verify.js';
import { roleUrl } from '../shared/configuration.js';
/**
 * Apply pending admin migrations as `nap-admin`, then verify the installed
 * contract. Connections close on success and failure.
 * @param {{endpoint: string, adminPassword: string, database: string}} config
 * @param {object[]} [modules=adminModules]
 * @returns {Promise<{status: 'applied'|'unchanged', database: string}>}
 * @throws {MaintenanceError} From registry validation, database verification, or contract verification.
 */
export async function migrateAdmin(config, modules = adminModules) {
  validateAdminRegistry(modules);
  const handle = createAdminDatabase(
    roleUrl(config.endpoint, 'nap-admin', config.adminPassword)
  );
  try {
    await handle.connect();
    await verifyDatabase(handle.db, config.database);
    const result = await handle.migrate({ schema: 'admin', modules });
    await verifyAdmin(handle, modules);
    return {
      status: result.applied.length ? 'applied' : 'unchanged',
      database: config.database,
    };
  } finally {
    await handle.close();
  }
}
