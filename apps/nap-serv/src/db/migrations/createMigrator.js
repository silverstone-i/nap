/**
 * @file Creates a migrator bound to the application's module registry
 * @module nap-serv/db/migrations/createMigrator
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import crypto from 'node:crypto';
import { DB } from 'pg-schemata';
import { sortMigrations } from './defineMigration.js';

const TENANT_PLACEHOLDER = /tenantid/i;
const HISTORY_SCHEMA = 'pgschemata';
const HISTORY_TABLE = 'migrations';

function resolveSchema(model, requestedSchema) {
  const defaultSchema = model?.schema?.dbSchema ?? '';
  const normalized = `${defaultSchema}`.toLowerCase();
  if (TENANT_PLACEHOLDER.test(defaultSchema) || normalized === 'public') {
    return requestedSchema;
  }
  return defaultSchema || requestedSchema;
}

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

async function ensureExtensions(t, extensions = []) {
  if (!extensions?.length) return;
  for (const extension of extensions) {
    await t.none(`CREATE EXTENSION IF NOT EXISTS ${DB.pgp.as.name(extension)}`);
  }
}

async function loadAppliedIds(t, schemaName, moduleName) {
  const rows = await t.manyOrNone(
    `SELECT migration_id FROM ${DB.pgp.as.name(HISTORY_SCHEMA)}.${DB.pgp.as.name(HISTORY_TABLE)}
     WHERE schema_name = $1 AND module_name = $2`,
    [schemaName, moduleName],
  );
  return new Set(rows.map((row) => row.migration_id));
}

async function recordMigration(t, { schemaName, moduleName, migration }) {
  await t.none(
    `INSERT INTO ${DB.pgp.as.name(HISTORY_SCHEMA)}.${DB.pgp.as.name(HISTORY_TABLE)}
     (schema_name, module_name, migration_id, checksum, description)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (schema_name, module_name, migration_id) DO NOTHING`,
    [schemaName, moduleName, migration.id, migration.checksum, migration.description],
  );
}

/**
 * Creates a migrator bound to the application's module registry.
 * @param {object} options
 * @param {Record<string, object>} options.modules Module definitions with migrations and repositories
 * @param {object} [options.logger]
 * @returns {{ run: Function }}
 */
export function createMigrator({ modules = {}, logger = null } = {}) {
  if (!modules || typeof modules !== 'object') {
    throw new TypeError('createMigrator requires a modules definition map');
  }

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

  async function run({ schema, modules: moduleSubset, dryRun = false, advisoryLock = null } = {}) {
    if (!schema || typeof schema !== 'string') {
      throw new TypeError('migrator.run requires a target schema string');
    }

    const selectedModuleNames = (moduleSubset?.length ? moduleSubset : Object.keys(modules)).filter(Boolean);
    const results = [];

    await DB.db.tx(async (t) => {
      if (advisoryLock !== null && advisoryLock !== undefined) {
        const { locked } = await t.one('SELECT pg_try_advisory_xact_lock($1) AS locked', [advisoryLock]);
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
        const pending = migrations.filter((m) => !appliedIds.has(m.id));

        if (!pending.length) {
          results.push({ module: moduleName, applied: 0, pending: [] });
          continue;
        }

        if (dryRun) {
          results.push({ module: moduleName, applied: 0, pending: pending.map((m) => m.id), skipped: true });
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
            ensureExtensions: (exts) => ensureExtensions(t, exts),
            checksum: crypto.createHash('sha256').update(migration.id).digest('hex'),
          };

          await migration.up(context);
          await recordMigration(t, { schemaName: schema, moduleName, migration });
        }

        results.push({ module: moduleName, applied: pending.length, pending: pending.map((m) => m.id) });
      }
    });

    return { schema, modules: results, dryRun };
  }

  return { run };
}

export default createMigrator;
