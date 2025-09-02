'use strict';

import fs from 'fs';

function isValidModel(model) {
  return typeof model?.createTable === 'function' && model.schema?.dbSchema && model.schema?.table;
}

function getTableDependencies(model) {
  const schema = model.schema;
  if (!schema?.constraints?.foreignKeys) return [];
  return Array.from(
    new Set(
      schema.constraints.foreignKeys.map((fk) => {
        const [schemaName, tableName] = fk.references.table.includes('.')
          ? fk.references.table.split('.')
          : [model.schema.dbSchema, fk.references.table];
        return `${schemaName}.${tableName}`.toLowerCase();
      }),
    ),
  );
}

function topoSortModels(models) {
  const sorted = [];
  const visited = new Set();
  function visit(key, visiting = new Set()) {
    const model = models[key];
    const deps = getTableDependencies(model);
    if (visited.has(key)) return;
    if (visiting.has(key)) throw new Error(`Cyclic dependency detected: ${Array.from(visiting).join(' -> ')} -> ${key}`);
    visiting.add(key);
    for (const dep of deps) {
      if (dep === key) continue;
      if (models[dep]) visit(dep, visiting);
    }
    visiting.delete(key);
    visited.add(key);
    sorted.push(key);
  }
  for (const key of Object.keys(models)) visit(key);
  return sorted;
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
}

export { isValidModel, getTableDependencies, topoSortModels, writeDependencyGraph };
