/**
 * @file Dependency-aware table creation/dropping utilities
 * @module nap-serv/db/migrations/modelPlanner
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/**
 * Determines whether the provided repository instance represents a table model.
 * @param {object} model
 * @returns {boolean}
 */
export function isTableModel(model) {
  return typeof model?.createTable === 'function' && model.schema?.dbSchema && model.schema?.table;
}

/**
 * Returns a stable key for a model based on schema.table.
 * @param {object} model
 * @returns {string}
 */
export function getModelKey(model) {
  return `${model.schema?.dbSchema}.${model.schema?.table}`.toLowerCase();
}

/**
 * Computes a list of foreign key dependencies for the supplied model.
 * @param {object} model
 * @returns {string[]}
 */
export function getTableDependencies(model) {
  const schema = model?.schema;
  if (!schema?.constraints?.foreignKeys) return [];

  return Array.from(
    new Set(
      schema.constraints.foreignKeys
        .map((fk) => {
          if (!fk?.references?.table) return null;
          if (fk.references.table.includes('.')) {
            return fk.references.table.toLowerCase();
          }
          const targetSchema = fk.references.schema ?? schema.dbSchema;
          return `${targetSchema}.${fk.references.table}`.toLowerCase();
        })
        .filter(Boolean),
    ),
  );
}

/**
 * Performs a dependency-aware ordering of models based on their foreign keys.
 * @param {Record<string, object>} models
 * @returns {object[]} Ordered list of models ready for table creation.
 */
export function orderModels(models = {}) {
  const entries = Object.entries(models).filter(([, model]) => isTableModel(model));
  const graph = new Map(entries.map(([key, model]) => [key, getTableDependencies(model)]));
  const visited = new Set();
  const visiting = new Set();
  const orderedKeys = [];

  function visit(key) {
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      throw new Error(`Cyclic dependency detected: ${Array.from(visiting).join(' -> ')} -> ${key}`);
    }
    visiting.add(key);
    const deps = graph.get(key) ?? [];
    for (const dep of deps) {
      if (dep === key) continue;
      if (graph.has(dep)) visit(dep);
    }
    visiting.delete(key);
    visited.add(key);
    orderedKeys.push(key);
  }

  for (const key of graph.keys()) {
    visit(key);
  }

  return orderedKeys.map((key) => models[key]).filter(Boolean);
}

/**
 * Drops tables in reverse dependency order.
 * @param {object[]} models
 * @returns {Promise<void>}
 */
export async function dropTables(models = []) {
  const reversed = [...models].reverse();
  for (const model of reversed) {
    if (!isTableModel(model)) continue;
    const dropSql = `DROP TABLE IF EXISTS ${model.schemaName}.${model.tableName} CASCADE`;
    await model.db.none(dropSql);
  }
}
