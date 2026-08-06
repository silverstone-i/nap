/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { MigrationManager } from 'pg-schemata';
import type {
  ApplyAllResult,
  Logger,
  MigrationManagerOptions,
} from 'pg-schemata';
import { getDb } from './connection.js';
import { moduleRegistry, modulesForScope } from './registry.js';
import type { NapModule } from './registry.js';

/** The one schema admin-scope modules migrate. */
const ADMIN_SCHEMA = 'admin';

/**
 * The slice of {@link MigrationManager} the migrator drives. A seam for unit
 * tests; production code always gets the real class.
 */
export type MigrationRunner = Pick<MigrationManager, 'applyAll'>;

/** Dependency seams shared by all three entry points. */
export interface MigratorOptions {
  /** Registry to draw modules from. Defaults to the real one. */
  modules?: readonly NapModule[];
  /** Logger handed to the migration manager. */
  logger?: Logger | null;
  /** Manager factory. Defaults to constructing a real MigrationManager. */
  createManager?: (options: MigrationManagerOptions) => MigrationRunner;
}

/** Options for {@link migrateAllTenants}. */
export interface MigrateAllTenantsOptions extends MigratorOptions {
  /**
   * Enumerates the tenant schemas to migrate. Defaults to querying active,
   * non-deleted rows of `admin.tenants` through the initialized db handle.
   */
  listTenantSchemas?: () => Promise<string[]>;
}

/** Outcome of one tenant schema inside a {@link migrateAllTenants} run. */
export type TenantMigrationResult =
  | { schemaName: string; status: 'migrated'; result: ApplyAllResult }
  | { schemaName: string; status: 'failed'; error: unknown };

/**
 * Thrown by {@link migrateAllTenants} after every tenant has been attempted,
 * when at least one failed. Carries the full per-schema report so callers can
 * print it before exiting non-zero.
 */
export class TenantMigrationsError extends Error {
  readonly results: readonly TenantMigrationResult[];

  constructor(results: readonly TenantMigrationResult[]) {
    const failed = results
      .filter(result => result.status === 'failed')
      .map(result => result.schemaName);
    super(
      `Tenant migrations failed for ${failed.length} of ${results.length} schema(s): ${failed.join(', ')}`
    );
    this.name = 'TenantMigrationsError';
    this.results = results;
  }
}

function defaultCreateManager(
  options: MigrationManagerOptions
): MigrationRunner {
  return new MigrationManager(options);
}

/**
 * Rows of `admin.tenants` an all-tenants run migrates: active and not
 * soft-deleted. Verified against the real table once it exists (PRD 0002).
 */
const ACTIVE_TENANT_SCHEMAS_SQL = `
  SELECT schema_name
  FROM admin.tenants
  WHERE status = 'active' AND deactivated_at IS NULL
  ORDER BY schema_name
`;

async function defaultListTenantSchemas(): Promise<string[]> {
  const rows = await getDb().manyOrNone<{ schema_name: string }>(
    ACTIVE_TENANT_SCHEMAS_SQL
  );
  return rows.map(row => row.schema_name);
}

/**
 * Runs admin-scope modules' migrations against the `admin` schema. Scope
 * filtering happens here via the registry — no migration file ever tests
 * which schema it is running in (ADR-0005).
 */
export async function migrateAdmin(
  options: MigratorOptions = {}
): Promise<ApplyAllResult> {
  const {
    modules = moduleRegistry,
    logger = null,
    createManager = defaultCreateManager,
  } = options;

  const manager = createManager({
    schema: ADMIN_SCHEMA,
    modules: modulesForScope('admin', modules),
    logger,
  });
  return manager.applyAll();
}

/**
 * Runs tenant-scope modules' migrations against one tenant schema.
 *
 * @throws {Error} When the schema name is blank, or names the admin schema —
 *   a tenant run must never target `admin`.
 */
export async function migrateTenant(
  schemaName: string,
  options: MigratorOptions = {}
): Promise<ApplyAllResult> {
  const {
    modules = moduleRegistry,
    logger = null,
    createManager = defaultCreateManager,
  } = options;

  const target = schemaName.trim();
  if (target === '') {
    throw new Error('migrateTenant() requires a schema name');
  }
  if (target === ADMIN_SCHEMA) {
    throw new Error(
      'migrateTenant() must not target the admin schema; use migrateAdmin()'
    );
  }

  const manager = createManager({
    schema: target,
    modules: modulesForScope('tenant', modules),
    logger,
  });
  return manager.applyAll();
}

/**
 * Migrates every active tenant schema, sequentially, continuing past
 * failures so one broken schema does not leave the rest unmigrated.
 *
 * @returns Per-schema results, in the order the schemas were attempted.
 * @throws {TenantMigrationsError} After all schemas have been attempted, when
 *   at least one failed. The error carries the full result list, and an
 *   uncaught throw exits the calling script non-zero.
 */
export async function migrateAllTenants(
  options: MigrateAllTenantsOptions = {}
): Promise<TenantMigrationResult[]> {
  const { listTenantSchemas = defaultListTenantSchemas, ...migratorOptions } =
    options;

  const results: TenantMigrationResult[] = [];
  for (const rawName of await listTenantSchemas()) {
    const schemaName = rawName.trim();
    try {
      const result = await migrateTenant(schemaName, migratorOptions);
      results.push({ schemaName, status: 'migrated', result });
    } catch (error) {
      results.push({ schemaName, status: 'failed', error });
    }
  }

  if (results.some(result => result.status === 'failed')) {
    throw new TenantMigrationsError(results);
  }
  return results;
}
