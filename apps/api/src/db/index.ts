/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export { createTables } from './createTablesMigration.js';
export {
  closeDb,
  getDb,
  initDb,
  isDbInitialized,
  probeDb,
  resolveConnectionString,
} from './connection.js';
export {
  migrateAdmin,
  migrateAllTenants,
  migrateTenant,
  TenantMigrationsError,
} from './migrator.js';
export type {
  MigrateAllTenantsOptions,
  MigrationRunner,
  MigratorOptions,
  TenantMigrationResult,
} from './migrator.js';
export {
  collectRepositories,
  moduleRegistry,
  modulesForScope,
} from './registry.js';
export type { NapModule, SchemaScope } from './registry.js';
export type { AuditRow, EntityRow } from './rows.js';
