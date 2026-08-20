/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Database composition surface.
 *
 * Re-exports only. Creating a handle is the caller's decision so that
 * lifecycle stays with the composition root that owns it; nothing here holds
 * a module-level instance.
 */

export { assertRuntimeRole, RuntimeRoleError } from './assertRuntimeRole.js';
export type { AssertRuntimeRoleOptions } from './assertRuntimeRole.js';

export { createAdminDb } from './admin/createAdminDb.js';
export type {
  AdminDatabase,
  CreateAdminDbOptions,
} from './admin/createAdminDb.js';
export { migrateAdmin } from './admin/migrateAdmin.js';
export type { MigrateAdminOptions } from './admin/migrateAdmin.js';
export {
  ADMIN_SCHEMA,
  adminModules,
  adminRepositories,
} from './admin/moduleRegistry.js';

export { createCellDb } from './cell/createCellDb.js';
export type { CellDatabase, CreateCellDbOptions } from './cell/createCellDb.js';
export { migrateCell } from './cell/migrateCell.js';
export type { MigrateCellOptions } from './cell/migrateCell.js';
export {
  CELL_SCHEMAS,
  cellModules,
  cellRepositories,
} from './cell/moduleRegistry.js';
export type {
  CellModuleDescriptor,
  CellSchema,
} from './cell/moduleRegistry.js';
export {
  TenantContextError,
  withTenantTransaction,
} from './cell/withTenantTransaction.js';
export type { CellTransaction } from './cell/withTenantTransaction.js';
