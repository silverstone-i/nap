/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ModuleDescriptor, RepositoryCtor } from 'pg-schemata';

/**
 * Cell-targeted module registry.
 *
 * A cell has one physical set of application tables shared by every tenant
 * assigned to it (ARCH-013). Modules whose descriptor sets
 * `databaseTarget: 'cell'` register here and nowhere else.
 *
 * Phase 1 establishes the composition root only; the registries are populated
 * from Phase 3 onward.
 */

/** The physical schemas a cell database contains. */
export const CELL_SCHEMAS = ['cell', 'reference', 'app', 'reporting'] as const;

/** One of the cell database's physical schemas. */
export type CellSchema = (typeof CELL_SCHEMAS)[number];

/**
 * A migration module plus the cell schema it owns.
 *
 * `pg-schemata` resolves migrations one schema at a time, so the schema is
 * carried on the descriptor and the cell migration runner groups by it.
 */
export interface CellModuleDescriptor extends ModuleDescriptor {
  /** Physical schema this module's tables live in. */
  schema: CellSchema;
}

/** Repository constructors attached to the cell handle. */
export const cellRepositories = {} satisfies Record<string, RepositoryCtor>;

/** Ordered cell-targeted migration modules. */
export const cellModules: CellModuleDescriptor[] = [];
