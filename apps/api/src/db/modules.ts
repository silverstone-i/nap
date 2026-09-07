/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ModuleDescriptor } from 'pg-schemata';

/**
 * Does: Lists the physical schemas in a cell database, in migration order.
 * Used by: migrateDatabase, assertModules, and database tests.
 */
export const CELL_SCHEMAS = ['cell', 'reference', 'app', 'reporting'] as const;
/**
 * Does: Names one schema of a cell database.
 * Used by: NapModuleDescriptor.
 */
export type CellSchema = (typeof CELL_SCHEMAS)[number];
/**
 * Does: Names which of the two databases an operation applies to.
 * Used by: migrateDatabase, assertModules, and NapModuleDescriptor.
 */
export type DatabaseTarget = 'admin' | 'cell';
/**
 * Does: Describes one database module: its name and migrations, from the
 * library's descriptor, plus which database and schema it belongs to.
 * Used by: the admin and cell module registries, and migrateDatabase.
 * Why: the type allows only admin with the admin schema or cell with one of
 * the cell schemas, so a module cannot be registered against the wrong
 * database.
 */
export type NapModuleDescriptor = ModuleDescriptor &
  (
    | { databaseTarget: 'admin'; schema: 'admin' }
    | { databaseTarget: 'cell'; schema: CellSchema }
  );

/**
 * Does: Checks a list of module descriptors is valid for the given database:
 * right target, known schema, non-empty unique names, and a migrations array.
 * Called by: migrateDatabase before it opens a connection, and by unit tests.
 * Why: a bad or duplicate descriptor fails here, before any database work,
 * with one fixed message.
 * @throws When the target is unknown or any descriptor is invalid or repeated.
 */
export function assertModules(
  target: DatabaseTarget,
  modules: readonly NapModuleDescriptor[]
) {
  if (target !== 'admin' && target !== 'cell')
    throw new Error('Migration target must be admin or cell');
  const names = new Set<string>();
  for (const module of modules) {
    if (
      !module ||
      module.databaseTarget !== target ||
      !(target === 'admin'
        ? module.schema === 'admin'
        : CELL_SCHEMAS.some(schema => schema === module.schema)) ||
      typeof module.name !== 'string' ||
      !module.name.trim() ||
      names.has(module.name) ||
      !Array.isArray(module.migrations)
    )
      throw new Error('Invalid or duplicate database module descriptor');
    names.add(module.name);
  }
}
