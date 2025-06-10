'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { db, pgp } from '../db/db.js';
import { loadViews } from './loadViews.js';

// Extracts table dependencies from model's foreign keys
function getTableDependencies(model) {
  const schema = model.schema;
  if (!schema?.constraints?.foreignKeys) return [];

  // console.log(`Model: ${schema.dbSchema}.${schema.table}, FK references:`, schema.constraints.foreignKeys.map(fk => fk.references));

  return Array.from(
    new Set(
      schema.constraints.foreignKeys.map(fk => {
        // console.log('FK:', fk.references);
        const [schemaName, tableName] = fk.references.table.includes('.')
          ? fk.references.table.split('.')
          : [model.schema.dbSchema, fk.references.table];
        // console.log('schemaName:', schemaName, 'tableName:', tableName);
        return `${schemaName}.${tableName}`.toLowerCase();
      })
    )
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

async function migrateTenants({
  schemaList = ['tenantid'],
  dbOverride = db,
  pgpOverride = pgp,
  testFlag = false,
} = {}) {
  // Check if schema exists in the database
  async function schemaExists(schemaName) {
    const result = await dbOverride.oneOrNone(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      [schemaName]
    );
    return !!result;
  }

  let sortedKeys = [];
  const adminTables = ['admin.tenants', 'admin.nap_users'];
  let validModels = {};
  try {
    // Ensure 'admin' is never part of schemaList
    if (schemaList.includes('admin')) {
      schemaList.push('admin');
    }

    // Ensure 'admin' is included the schema does not already exist
    const exists = await schemaExists('admin');
    if (!exists) {
      schemaList.unshift('admin');
    }

    for (const schemaName of schemaList) {
      if (schemaName !== 'admin') {
        await dbOverride.none(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`);
      }
    }
    for (const schemaName of schemaList) {
      const createdAdminTables = new Set();

      const allowedAdminTables = new Set(adminTables.map(t => t.toLowerCase()));

      const modelsForSchema = Object.fromEntries(
        Object.entries(dbOverride)
          .filter(([, model]) => {
            if (!isValidModel(model)) return false;
            const originalSchema = `${model.schema?.dbSchema}.${model.schema?.table}`.toLowerCase();
            const isAdminTable = allowedAdminTables.has(originalSchema);
            const effectiveSchema = isAdminTable ? 'admin' : schemaName;
            const schemaScopedModel = dbOverride(model, effectiveSchema);
            const fullName = `${schemaScopedModel.schema.dbSchema}.${schemaScopedModel.schema.table}`.toLowerCase();

            if (schemaName === 'admin') {
              return allowedAdminTables.has(fullName);
            }

            if (isAdminTable) return false;
            if (fullName.startsWith('admin.')) return false;

            return true;
          })
          .map(([, model]) => {
            const originalSchema = `${model.schema?.dbSchema}.${model.schema?.table}`.toLowerCase();
            const isAdminTable = allowedAdminTables.has(originalSchema);
            const effectiveSchema = isAdminTable ? 'admin' : schemaName;
            const schemaScopedModel = dbOverride(model, effectiveSchema);
            return [
              `${schemaScopedModel.schema.dbSchema}.${schemaScopedModel.schema.table}`.toLowerCase(),
              schemaScopedModel,
            ];
          })
      );
      // console.log('✅ Models for schema', schemaName, Object.keys(modelsForSchema));
      const keys = topoSortModels(modelsForSchema);
      // console.log('🧭 Sorted model keys for', schemaName, keys);

      for (const key of keys) {
        const model = modelsForSchema[key];
        const isAdminTable = model.schema.dbSchema === 'admin';
        if (model?.constructor?.isViewModel) continue;
        if (isAdminTable && !allowedAdminTables.has(key)) continue;
        console.log(`🔨 Creating table: ${model.schema.dbSchema}.${model.schema.table}`);
        await dbOverride(model, schemaName).createTable();
        if (schemaName === 'admin') {
          createdAdminTables.add(key);
        }
      }

      const createdAdminTablesSet = new Set(keys);

      // Only bootstrap super admin if admin.nap_users and admin.tenants were created
      if (
        schemaName === 'admin' &&
        createdAdminTablesSet.has('admin.nap_users') &&
        createdAdminTablesSet.has('admin.tenants')
      ) {
        const { bootstrapSuperAdmin } = await import('../../scripts/bootstrapSuperAdmin.js');
        await bootstrapSuperAdmin(dbOverride);
      }

      await loadViews(dbOverride, schemaName);
      console.log(`Views loaded for schema: ${schemaName}`);
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
