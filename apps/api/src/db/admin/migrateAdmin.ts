/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ApplyAllResult, Logger, ModuleDescriptor } from 'pg-schemata';

import { createAdminDb } from './createAdminDb.js';
import { ADMIN_SCHEMA, adminModules } from './moduleRegistry.js';

/** Options accepted by {@link migrateAdmin}. */
export interface MigrateAdminOptions {
  /**
   * Target connection string, using the owning role. Required and never
   * defaulted: an admin migration always names its target (ARCH-025).
   */
  connectionString: string;
  /** Module override. Defaults to the admin registry. */
  modules?: ModuleDescriptor[];
  /** Report pending migrations without executing or recording anything. */
  dryRun?: boolean;
  /** Logger for the run. */
  logger?: Logger | null;
}

/**
 * Applies admin migrations to one central administration database.
 *
 * A release command: it opens its own handle with migration credentials,
 * migrates, and closes. It is never called from application startup, and it
 * runs once per admin database rather than once per tenant.
 *
 * @param options - Explicit target and run configuration.
 * @returns The migration run result.
 */
export async function migrateAdmin(
  options: MigrateAdminOptions
): Promise<ApplyAllResult> {
  const db = createAdminDb({
    connectionString: options.connectionString,
    logger: options.logger ?? null,
  });

  try {
    return await db.migrate({
      schema: ADMIN_SCHEMA,
      modules: options.modules ?? adminModules,
      logger: options.logger ?? null,
      dryRun: options.dryRun,
    });
  } finally {
    await db.close();
  }
}
