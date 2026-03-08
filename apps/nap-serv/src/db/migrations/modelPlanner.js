/**
 * @file Dependency-aware table creation/dropping utilities
 * @module nap-serv/db/migrations/modelPlanner
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
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
 * Resolves execution order for modules based on cross-module FK dependencies.
 *
 * Instantiates all models from all modules, builds a table → module lookup,
 * extracts cross-module FK edges, and topological-sorts at the module level.
 *
 * @param {Record<string, { repositories: Record<string, Function> }>} modules
 *   The modules map (same shape createMigrator receives).
 * @param {string} schema  Target schema name (e.g. 'diag').
 * @param {object} db      pg-promise database/transaction object.
 * @param {object} pgp     pg-promise root object.
 * @param {object} [logger]
 * @returns {string[]} Module names in dependency-safe execution order.
 */
export function resolveModuleOrder(modules, schema, db, pgp, logger = null) {
  // 1. Instantiate every model and build table → module lookup
  const tableToModule = new Map();

  for (const [moduleName, moduleDef] of Object.entries(modules)) {
    for (const [, ModelClass] of Object.entries(moduleDef.repositories ?? {})) {
      if (typeof ModelClass !== 'function') continue;
      let instance;
      try {
        instance = new ModelClass(db, pgp, logger);
      } catch {
        continue;
      }
      if (!isTableModel(instance)) continue;

      // Resolve schema the same way createMigrator does
      const defaultSchema = instance.schema?.dbSchema ?? '';
      const normalized = `${defaultSchema}`.toLowerCase();
      const effectiveSchema = /tenantid/i.test(defaultSchema) || normalized === 'public' ? schema : defaultSchema || schema;

      if (typeof instance.setSchemaName === 'function') instance.setSchemaName(effectiveSchema);

      const tableKey = `${effectiveSchema}.${instance.schema.table}`.toLowerCase();
      tableToModule.set(tableKey, moduleName);
    }
  }

  // 2. Build module-level dependency graph
  const moduleNames = Object.keys(modules);
  const moduleDeps = new Map(moduleNames.map((name) => [name, new Set()]));

  for (const [moduleName, moduleDef] of Object.entries(modules)) {
    for (const [, ModelClass] of Object.entries(moduleDef.repositories ?? {})) {
      if (typeof ModelClass !== 'function') continue;
      let instance;
      try {
        instance = new ModelClass(db, pgp, logger);
      } catch {
        continue;
      }
      if (!isTableModel(instance)) continue;

      const defaultSchema = instance.schema?.dbSchema ?? '';
      const normalizedSchema = `${defaultSchema}`.toLowerCase();
      const effectiveSchema =
        /tenantid/i.test(defaultSchema) || normalizedSchema === 'public' ? schema : defaultSchema || schema;

      if (typeof instance.setSchemaName === 'function') instance.setSchemaName(effectiveSchema);

      for (const depKey of getTableDependencies(instance)) {
        const ownerModule = tableToModule.get(depKey);
        if (ownerModule && ownerModule !== moduleName) {
          moduleDeps.get(moduleName)?.add(ownerModule);
        }
      }
    }
  }

  // 3. Topological sort (DFS, same pattern as orderModels)
  const visited = new Set();
  const visiting = new Set();
  const ordered = [];

  function visit(name) {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(`Cyclic module dependency: ${Array.from(visiting).join(' → ')} → ${name}`);
    }
    visiting.add(name);
    for (const dep of moduleDeps.get(name) ?? []) {
      visit(dep);
    }
    visiting.delete(name);
    visited.add(name);
    ordered.push(name);
  }

  for (const name of moduleNames) {
    visit(name);
  }

  return ordered;
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
