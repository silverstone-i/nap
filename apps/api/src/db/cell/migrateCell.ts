/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ApplyAllResult, Logger } from 'pg-schemata';

import { createCellDb } from './createCellDb.js';
import { cellModules } from './moduleRegistry.js';
import type { CellModuleDescriptor, CellSchema } from './moduleRegistry.js';

/** Options accepted by {@link migrateCell}. */
export interface MigrateCellOptions {
  /**
   * Target connection string, using the owning role. Required and never
   * defaulted: a cell migration always names its target (ARCH-025).
   */
  connectionString: string;
  /** Module override. Defaults to the cell registry. */
  modules?: CellModuleDescriptor[];
  /** Report pending migrations without executing or recording anything. */
  dryRun?: boolean;
  /** Logger for the run. */
  logger?: Logger | null;
}

/**
 * Applies cell migrations to one cell database.
 *
 * A release command with the same lifecycle rules as the admin runner. Adding
 * a tenant creates records, never a migration target: this runs once per cell
 * database, and once per schema within it, because `pg-schemata` resolves
 * migrations against a single schema at a time.
 *
 * @param options - Explicit target and run configuration.
 * @returns One result per schema that had registered modules, in schema order.
 */
export async function migrateCell(
  options: MigrateCellOptions
): Promise<ApplyAllResult[]> {
  const modules = options.modules ?? cellModules;
  const logger = options.logger ?? null;

  const bySchema = new Map<CellSchema, CellModuleDescriptor[]>();
  for (const module of modules) {
    const forSchema = bySchema.get(module.schema) ?? [];
    forSchema.push(module);
    bySchema.set(module.schema, forSchema);
  }

  const db = createCellDb({
    connectionString: options.connectionString,
    logger,
  });

  try {
    const results: ApplyAllResult[] = [];

    // Sequential: the runs share one pool, and a later schema may depend on an
    // earlier one having been created.
    for (const [schema, schemaModules] of bySchema) {
      results.push(
        await db.migrate({
          schema,
          modules: schemaModules,
          logger,
          dryRun: options.dryRun,
        })
      );
    }

    return results;
  } finally {
    await db.close();
  }
}
