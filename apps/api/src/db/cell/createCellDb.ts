/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createDb } from 'pg-schemata';
import type {
  DatabasePoolConfig,
  Logger,
  RepositoryInstances,
} from 'pg-schemata';
import type { Database } from 'pg-schemata';

import { databaseUrl } from '../../util/env.js';
import { cellRepositories } from './moduleRegistry.js';

/**
 * The handle for the one cell this deployment serves.
 *
 * A cell deployment receives credentials for the central database and its own
 * cell only (ARCH-009); there is no registry of other cells' handles.
 */
export type CellDatabase = Database<
  RepositoryInstances<typeof cellRepositories>
>;

/** Options accepted by {@link createCellDb}. */
export interface CreateCellDbOptions {
  /**
   * Connection string override. Defaults to the runtime-role URL for the
   * current environment; migration credentials never flow through here.
   */
  connectionString?: string;
  /** Logger handed to every repository this handle builds. */
  logger?: Logger | null;
  /** Pool tuning. */
  pool?: DatabasePoolConfig;
}

/**
 * Creates this deployment's cell database handle.
 *
 * Tenant-owned queries do not run directly on the returned handle; they run
 * through `withTenantTransaction()`.
 *
 * @param options - Connection and lifecycle overrides.
 * @returns A handle owning its own pool and cell repository registry.
 */
export function createCellDb(options: CreateCellDbOptions = {}): CellDatabase {
  return createDb({
    connectionString:
      options.connectionString ?? databaseUrl('CELL', 'RUNTIME'),
    repositories: cellRepositories,
    logger: options.logger ?? null,
    pool: options.pool,
  });
}
