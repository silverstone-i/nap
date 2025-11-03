'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import crypto from 'node:crypto';
import { DB } from 'pg-schemata';
import { sortMigrations } from './defineMigration.js';

const TENANT_PLACEHOLDER = /tenantid/i;
const HISTORY_SCHEMA = 'pgschemata';
const HISTORY_TABLE = 'migrations';

/**
 * Resolves the effective schema for a model given the requested schema.
 * Tables that declare their schema as "tenantid" are treated as tenant-scoped.
 *
 * @param {object} model TableModel instance
 * @param {string} requestedSchema Target schema passed to the migrator
 * @returns {string} Effective schema for this model
 */
function resolveSchema(model, requestedSchema) {
  const defaultSchema = model?.schema?.dbSchema ?? '';
  const normalized = `${defaultSchema}`.toLowerCase();
  if (TENANT_PLACEHOLDER.test(defaultSchema) || normalized === 'public') {
    return requestedSchema;
  }
  return defaultSchema || requestedSchema;
}

/**
 * Ensures the pg_schemata schema and migrations table exist.
 *
 * @param {import('pg-promise').ITask<any>} t pg-promise transaction/task
 */
async function ensureHistoryTable(t) {
  await t.none(`CREATE SCHEMA IF NOT EXISTS ${DB.pgp.as.name(HISTORY_SCHEMA)}`);
  await t.none(`
    CREATE TABLE IF NOT EXISTS ${DB.pgp.as.name(HISTORY_SCHEMA)}.${DB.pgp.as.name(HISTORY_TABLE)} (
      schema_name text NOT NULL,
      module_name text NOT NULL,
      migration_id text NOT NULL,
      checksum text NULL,
      description text NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (schema_name, module_name, migration_id)
    )
  `);
}

/**
 * Ensures a set of PostgreSQL extensions exist.
 *
 * @param {import('pg-promise').ITask<any>} t
 * @param {string[]} extensions
 */
async function ensureExtensions(t, extensions = []) {
  if (!extensions?.length) return;
  for (const extension of extensions) {
    await t.none(`CREATE EXTENSION IF NOT EXISTS ${DB.pgp.as.name(extension)}`);
  }
}

/**
 * Loads applied migration ids for the given schema/module pair.
 *
 * @param {import('pg-promise').ITask<any>} t
 * @param {string} schemaName
 * @param {string} moduleName
 * @returns {Promise<Set<string>>}
 */
async function loadAppliedIds(t, schemaName, moduleName) {
  const rows = await t.manyOrNone(
    `
      SELECT migration_id
      FROM ${DB.pgp.as.name(HISTORY_SCHEMA)}.${DB.pgp.as.name(HISTORY_TABLE)}
      WHERE schema_name = $1 AND module_name = $2
    `,
    [schemaName, moduleName],
  );
  return new Set(rows.map(row => row.migration_id));
}

/**
 * Persists a migration run to pg_schemata.migrations.
 *
 * @param {import('pg-promise').ITask<any>} t
 * @param {object} options
 */
async function recordMigration(t, { schemaName, moduleName, migration }) {
  await t.none(
    `
      INSERT INTO ${DB.pgp.as.name(HISTORY_SCHEMA)}.${DB.pgp.as.name(HISTORY_TABLE)} (schema_name, module_name, migration_id, checksum, description)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (schema_name, module_name, migration_id) DO NOTHING
    `,
    [schemaName, moduleName, migration.id, migration.checksum, migration.description],
  );
}

/**
 * Creates a migrator bound to the application's module registry.
 *
 * @param {object} options
 * @param {Record<string, {migrations: Array<object>, repositories: Record<string, Function>, scope?: 'admin'|'tenant'|'shared'}>} options.modules
 * @param {object} [options.logger]
 */
export function createMigrator({ modules = {}, logger = null } = {}) {
  if (!modules || typeof modules !== 'object') {
    throw new TypeError('createMigrator requires a modules definition map');
  }

  /**
   * Instantiates module models bound to the target schema and transaction.
   *
   * @param {string} schemaName
   * @param {import('pg-promise').ITask<any>} t
   * @param {Record<string, Function>} repositoryMap
   */
  function instantiateModels(schemaName, t, repositoryMap = {}) {
    const entries = Object.entries(repositoryMap);
    return Object.fromEntries(
      entries.map(([key, ModelClass]) => {
        if (typeof ModelClass !== 'function') return [key, null];
        const instance = new ModelClass(t, DB.pgp, logger);
        const effectiveSchema = resolveSchema(instance, schemaName);
        if (typeof instance.setSchemaName === 'function') {
          instance.setSchemaName(effectiveSchema);
        }
        return [key, instance];
      }),
    );
  }

  /**
   * Runs pending migrations for a specific schema.
   *
   * @param {object} options
   * @param {string} options.schema Target schema
   * @param {string[]} [options.modules] Subset of modules to run (defaults to all)
   * @param {boolean} [options.dryRun=false] Skip execution but report what would run
   * @param {number} [options.advisoryLock] Optional advisory lock key
   * @returns {Promise<object>}
   */
  async function run({ schema, modules: moduleSubset, dryRun = false, advisoryLock = null } = {}) {
    if (!schema || typeof schema !== 'string') {
      throw new TypeError('migrator.run requires a target schema string');
    }

    const selectedModuleNames = (moduleSubset?.length ? moduleSubset : Object.keys(modules)).filter(Boolean);

    const results = [];

    await DB.db.tx(async t => {
      if (advisoryLock !== null && advisoryLock !== undefined) {
        const { locked } = await t.one(`SELECT pg_try_advisory_xact_lock($1) AS locked`, [advisoryLock]);
        if (!locked) throw new Error('Another migration is currently running (advisory lock not acquired).');
      }

      await ensureHistoryTable(t);
      await ensureExtensions(t, ['pgcrypto', 'uuid-ossp']);

      for (const moduleName of selectedModuleNames) {
        const moduleDef = modules[moduleName];
        if (!moduleDef) {
          logger?.warn?.(`Skipping unknown module "${moduleName}" during migration run.`);
          continue;
        }

        const appliedIds = await loadAppliedIds(t, schema, moduleName);
        const migrations = sortMigrations(moduleDef.migrations ?? []);
        const models = instantiateModels(schema, t, moduleDef.repositories);

        const pending = migrations.filter(m => !appliedIds.has(m.id));
        if (!pending.length) {
          results.push({ module: moduleName, applied: 0, pending: [] });
          continue;
        }

        if (dryRun) {
          results.push({ module: moduleName, applied: 0, pending: pending.map(m => m.id), skipped: true });
          continue;
        }

        for (const migration of pending) {
          logger?.info?.(`Applying migration ${moduleName}:${migration.id} on schema ${schema}`);
          const context = {
            schema,
            module: moduleName,
            db: t,
            pgp: DB.pgp,
            logger,
            models,
            ensureExtensions: exts => ensureExtensions(t, exts),
            checksum: crypto.createHash('sha256').update(migration.id).digest('hex'),
          };

          await migration.up(context);
          await recordMigration(t, { schemaName: schema, moduleName, migration });
        }

        results.push({ module: moduleName, applied: pending.length, pending: pending.map(m => m.id) });
      }
    });

    return {
      schema,
      modules: results,
      dryRun,
    };
  }

  return {
    run,
  };
}

export default createMigrator;
