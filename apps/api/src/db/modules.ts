/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ModuleDescriptor } from 'pg-schemata';

export const CELL_SCHEMAS = ['cell', 'reference', 'app', 'reporting'] as const;
export type CellSchema = (typeof CELL_SCHEMAS)[number];
export type DatabaseTarget = 'admin' | 'cell';
/** One module belongs to exactly one database and one physical schema. */
export type NapModuleDescriptor = ModuleDescriptor &
  (
    | { databaseTarget: 'admin'; schema: 'admin' }
    | { databaseTarget: 'cell'; schema: CellSchema }
  );

/** Validate the entire release registry before opening any database handle. */
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
        : CELL_SCHEMAS.includes(module.schema as CellSchema)) ||
      typeof module.name !== 'string' ||
      !module.name.trim() ||
      names.has(module.name) ||
      !Array.isArray(module.migrations)
    )
      throw new Error('Invalid or duplicate database module descriptor');
    names.add(module.name);
  }
}
