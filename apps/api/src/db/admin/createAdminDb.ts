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
import { adminRepositories } from './moduleRegistry.js';

/**
 * The central administration handle.
 *
 * Independently typed, independently pooled, and independently closable from
 * the cell handle (ARCH-024). This module is the only place that creates it.
 */
export type AdminDatabase = Database<
  RepositoryInstances<typeof adminRepositories>
>;

/** Options accepted by {@link createAdminDb}. */
export interface CreateAdminDbOptions {
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
 * Creates the central administration database handle.
 *
 * Feature modules receive this handle or a transaction from it; nothing else
 * initializes a central connection.
 *
 * @param options - Connection and lifecycle overrides.
 * @returns A handle owning its own pool and admin repository registry.
 */
export function createAdminDb(
  options: CreateAdminDbOptions = {}
): AdminDatabase {
  return createDb({
    connectionString:
      options.connectionString ?? databaseUrl('ADMIN', 'RUNTIME'),
    repositories: adminRepositories,
    logger: options.logger ?? null,
    pool: options.pool,
  });
}
