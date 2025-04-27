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
import repositories from '../src/db/repositories.js';

// Extracts table dependencies from model's foreign keys
function getTableDependencies(model) {
  const schema = model.schema;
  if (!schema?.constraints?.foreignKeys) return [];

  return Array.from(new Set(schema.constraints.foreignKeys.map(fk => {
    let schemaName = 'public';
    let refTable = fk.references.table;

    if (refTable.includes('.')) {
      [schemaName, refTable] = refTable.split('.');
    } else if (fk.references.schema) {
      schemaName = fk.references.schema;
    }

    return `${schemaName}.${refTable}`;
  })));
}

// Performs topological sort to respect foreign key dependencies
function topoSortModels(models) {
  const sorted = [];
  const visited = new Set();
  const tableKeyMap = Object.fromEntries(
    Object.entries(models).flatMap(([k, m]) => [
      [`${m.schemaName}.${m.tableName}`, k], // schema-qualified key
      [m.tableName, k],                      // unqualified key
    ])
  );

  function visit(key, visiting = new Set()) {
    const model = models[key];
    const deps = getTableDependencies(model);
    // console.log(`Visiting ${key}, dependencies:`, deps);
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      throw new Error(`Cyclic dependency detected involving table: ${key}`);
    }

    visiting.add(key);
    // const deps = getTableDependencies(model); // Removed, already declared above
    for (const dep of deps) {
      // Try to match dependency with schema-qualified and unqualified table names
      const depKey = tableKeyMap[dep];
      if (depKey) visit(depKey, visiting);
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
  const edges = [];

  for (const key of sortedKeys) {
    const model = models[key];
    const schema = model.schema;
    if (!schema?.constraints?.foreignKeys) continue;

    for (const fk of schema.constraints.foreignKeys) {
      const from = `${schema.dbSchema}.${schema.table}`;
      const to = `${fk.references.schema || 'public'}.${fk.references.table}`;
      edges.push(`  "${from}" -> "${to}";`);
    }
  }

  const dot = [
    'digraph TableDependencies {',
    '  rankdir=LR;',
    ...edges,
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
        .map(([key, model]) => [`${model.schema.dbSchema}.${model.schema.table}`, model])
    );
    
    sortedKeys = topoSortModels(validModels);
    // console.log('Sorted table creation order:', sortedKeys);
    for (const key of sortedKeys) {
      const model = validModels[key];
      // console.log(
        // `Creating table for ${key} (${model.schema?.dbSchema}.${model.schema?.table})`
      // );

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
