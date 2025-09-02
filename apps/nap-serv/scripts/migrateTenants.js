'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { db, pgp } from '../src/db/db.js';
// import { loadViews } from './loadViews.js';
const { seedRbac } = await import('../src/seeds/seed_rbac.js');
const { bootstrapSuperAdmin } = await import('./bootstrapSuperAdmin.js');

// Extracts table dependencies from model's foreign keys
function getTableDependencies(model) {
  const schema = model.schema;
  if (!schema?.constraints?.foreignKeys) return [];

  // console.log(`Model: ${schema.dbSchema}.${schema.table}, FK references:`, schema.constraints.foreignKeys.map(fk => fk.references));

  return Array.from(
    new Set(
      schema.constraints.foreignKeys.map((fk) => {
        // console.log('FK:', fk.references);
        const [schemaName, tableName] = fk.references.table.includes('.')
          ? fk.references.table.split('.')
          : [model.schema.dbSchema, fk.references.table];
        // console.log('schemaName:', schemaName, 'tableName:', tableName);
        return `${schemaName}.${tableName}`.toLowerCase();
      }),
    ),
  );
}

// Performs topological sort to respect foreign key dependencies
function topoSortModels(models) {
  const sorted = [];
  const visited = new Set();

  function visit(key, visiting = new Set()) {
    const model = models[key];
    const deps = getTableDependencies(model);
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      throw new Error(`Cyclic dependency detected: ${Array.from(visiting).join(' -> ')} -> ${key}`);
    }

    visiting.add(key);
    for (const dep of deps) {
      if (dep === key) continue; // Skip self-referencing dependencies
      if (models[dep]) visit(dep, visiting);
    }

    visiting.delete(key);
    visited.add(key);
    sorted.push(key);
  }

  for (const key of Object.keys(models)) {
    visit(key);
  }

  return sorted;
}
import fs from 'fs';

function isValidModel(model) {
  return typeof model?.createTable === 'function' && model.schema?.dbSchema && model.schema?.table;
}

function writeDependencyGraph(models, sortedKeys) {
  const edges = new Set();

  for (const key of sortedKeys) {
    const model = models[key];
    const schema = model.schema;
    if (!schema?.constraints?.foreignKeys) continue;

    for (const fk of schema.constraints.foreignKeys) {
      const from = `${schema.dbSchema}.${schema.table}`;
      let refSchema = schema.dbSchema;
      let refTable = fk.references.table;

      if (refTable.includes('.')) {
        [refSchema, refTable] = refTable.split('.');
      } else if (fk.references.schema) {
        refSchema = fk.references.schema;
      }

      const to = `${refSchema}.${refTable}`;
      edges.add(`  "${from}" -> "${to}";`);
    }
  }

  const dot = ['digraph TableDependencies {', '  rankdir=LR;', ...Array.from(edges), '}'].join('\n');

  fs.writeFileSync('./table-dependencies.dot', dot);
  // console.log('\nDependency graph written to table-dependencies.dot\n');
}

async function migrateTenants({ schemaList = [], dbOverride = db, pgpOverride = pgp, testFlag = false } = {}) {
  // Check if schema exists in the database
  async function schemaExists(schemaName) {
    const result = await dbOverride.oneOrNone(`SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`, [schemaName]);
    return !!result;
  }

  let sortedKeys = [];
  const adminTables = ['admin.tenants', 'admin.nap_users', 'admin.match_review_logs'];
  let validModels = {};
  try {
    // Rule 1: If admin schema does not exist, run bootstrapSuperAdmin which creates tables and seeds RBAC
    const adminExists = await schemaExists('admin');
    if (!adminExists) {
      console.log('🧰 Admin schema missing. Bootstrapping super admin and base schemas...');
      await bootstrapSuperAdmin();
    }

    // Rule 2: For each schema in input list, DROP CASCADE the schema (including admin if passed), then load non-admin tables
    for (const schemaName of schemaList) {
      console.log(`🧨 Dropping schema if exists: ${schemaName}`);
      await dbOverride.none(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`);
      await dbOverride.none(`CREATE SCHEMA IF NOT EXISTS ${schemaName};`);
    }

    for (const schemaName of schemaList) {
      const createdAdminTables = new Set();

      const allowedAdminTables = new Set(adminTables.map((t) => t.toLowerCase()));

      const modelsForSchema = Object.fromEntries(
        Object.entries(dbOverride)
          .filter(([, model]) => {
            if (!isValidModel(model)) return false;
            const originalSchema = `${model.schema?.dbSchema}.${model.schema?.table}`.toLowerCase();
            const isAdminTable = allowedAdminTables.has(originalSchema);
            const effectiveSchema = isAdminTable ? 'admin' : schemaName;
            const schemaScopedModel = dbOverride(model, effectiveSchema);
            const fullName = `${schemaScopedModel.schema.dbSchema}.${schemaScopedModel.schema.table}`.toLowerCase();

            // Rule 2b: load all tables where table schema is not 'admin'
            if (schemaName === 'admin') {
              // For admin schema, only include admin tables
              return fullName.startsWith('admin.');
            }

            if (fullName.startsWith('admin.')) return false; // skip admin tables for tenant schemas

            return true;
          })
          .map(([, model]) => {
            const originalSchema = `${model.schema?.dbSchema}.${model.schema?.table}`.toLowerCase();
            const isAdminTable = allowedAdminTables.has(originalSchema);
            const effectiveSchema = isAdminTable ? 'admin' : schemaName;
            const schemaScopedModel = dbOverride(model, effectiveSchema);
            return [`${schemaScopedModel.schema.dbSchema}.${schemaScopedModel.schema.table}`.toLowerCase(), schemaScopedModel];
          }),
      );
      // console.log('✅ Models for schema', schemaName, Object.keys(modelsForSchema));
      const keys = topoSortModels(modelsForSchema);
      // console.log('🧭 Sorted model keys for', schemaName, keys);

      for (const key of keys) {
        const model = modelsForSchema[key];
        const isAdminTable = model.schema.dbSchema === 'admin';
        if (model?.constructor?.isViewModel) continue;
        if (isAdminTable && schemaName !== 'admin') continue; // never create admin tables in tenant schemas
        if (!isAdminTable && schemaName === 'admin') continue; // only admin tables in admin schema
        // console.log(`🔨 Creating table: ${model.schema.dbSchema}.${model.schema.table}`);
        await dbOverride(model, schemaName).createTable();
        if (schemaName === 'admin') {
          createdAdminTables.add(key);
        }
      }

      // createdAdminTablesSet not needed after RBAC seeding adjustment

      // Rule 3: Seed RBAC for every schema added (including admin)
      try {
        await seedRbac({ schemaName, createdBy: 'migrateTenants' });
      } catch (e) {
        console.warn(`Warning: failed seeding RBAC for schema ${schemaName}:`, e?.message || e);
      }

      // await loadViews(dbOverride, schemaName);
      // console.log(`Views loaded for schema: ${schemaName}`);
    }
  } catch (error) {
    console.error('Error during migration:', error.message);
    console.error('Stack trace:', error.stack);
    if (testFlag) {
      throw error;
    }
  } finally {
    writeDependencyGraph(validModels, sortedKeys);
    if (!testFlag) {
      await pgpOverride.end();
    }
    console.log('Database connection closed.\n');
    console.log('Migration completed.');
  }
}

export { migrateTenants };
export default migrateTenants;
