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

// Extracts table dependencies from model's foreign keys
function getTableDependencies(model) {
  const schema = model.schema;
  if (!schema?.constraints?.foreignKeys) return [];

  console.log(`Model: ${schema.dbSchema}.${schema.table}, FK references:`, schema.constraints.foreignKeys.map(fk => fk.references));

  return Array.from(new Set(schema.constraints.foreignKeys.map(fk => {
    console.log('FK:', fk.references);
    
    const [schemaName, tableName] = fk.references.table.includes('.')
      ? fk.references.table.split('.')
      : [fk.references.schema || 'public', fk.references.table];
    console.log('schemaName:', schemaName, 'tableName:', tableName);
    return `${schemaName}.${tableName}`.toLowerCase();
  })));
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
  return (
    typeof model?.createTable === 'function' &&
    model.schema?.dbSchema &&
    model.schema?.table
  );
}

function writeDependencyGraph(models, sortedKeys) {
  const edges = new Set();

  for (const key of sortedKeys) {
    const model = models[key];
    const schema = model.schema;
    if (!schema?.constraints?.foreignKeys) continue;

    for (const fk of schema.constraints.foreignKeys) {
      const from = `${schema.dbSchema}.${schema.table}`;
      let refSchema = 'public';
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

  const dot = [
    'digraph TableDependencies {',
    '  rankdir=LR;',
    ...Array.from(edges),
    '}',
  ].join('\n');

  fs.writeFileSync('./table-dependencies.dot', dot);
  console.log('\nDependency graph written to table-dependencies.dot\n');
}

async function runMigrate(
  dbOverride = db,
  pgpOverride = pgp,
  testFlag = false
) {
  let sortedKeys = [];
  let validModels = {};
  try {
    validModels = Object.fromEntries(
      Object.entries(dbOverride)
        .filter(([_, model]) => isValidModel(model))
        .map(([key, model]) => [`${model.schema.dbSchema}.${model.schema.table}`.toLowerCase(), model])
    );
    
    console.log('Loaded models:', Object.keys(validModels));
    sortedKeys = topoSortModels(validModels);
    console.log('Sorted table creation order:', sortedKeys);
    for (const key of sortedKeys) {
      const model = validModels[key];
      console.log(
        `Creating table for ${key} (${model.schema?.dbSchema}.${model.schema?.table})`
      );

      // Log the current search_path before creating the table
      const { search_path } = await dbOverride.one('SHOW search_path');

      await model.createTable();
      console.log('Created table:', key);
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

console.log('Starting migration...\n');

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await runMigrate().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

export { runMigrate };
export default runMigrate;
