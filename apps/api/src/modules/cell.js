/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';
import { descriptor as cellTenancy } from './cell-tenancy/descriptor.js';
import { descriptor as accessControl } from './access-control/descriptor.js';
import { descriptor as referenceData } from './reference-data/descriptor.js';
import { requireCondition } from '../application/shared/errors.js';
import { parseDeclarations } from './access-control/domain/capabilities.js';

/** Cell schemas in the order the runner migrates them. */
export const cellSchemas = Object.freeze([
  'cell',
  'reference',
  'app',
  'reporting',
]);

/** Cell database module registry, kept separate from the admin registry. */
export const cellModules = [cellTenancy, referenceData, accessControl];

/**
 * Validate the cell module registry before any database connection opens.
 *
 * Rejects a descriptor that targets another database or an unknown cell
 * schema, repeats a module name or migration ID, lacks a migration array,
 * uses an unknown `entitlementType`, declares malformed capabilities
 * (M0003-R005), or registers a model whose schema
 * targets another PostgreSQL schema or table name.
 * @param {object[]} [modules=cellModules] Module descriptors to check.
 * @returns {object[]} The same array when valid.
 * @throws {MaintenanceError} `INVALID_REGISTRY` on the first violation.
 */
export function validateCellRegistry(modules = cellModules) {
  const names = new Set();
  const ids = new Set();
  requireCondition(
    Array.isArray(modules) && modules.length > 0,
    'INVALID_REGISTRY'
  );
  for (const m of modules) {
    requireCondition(
      m.databaseTarget === 'cell' &&
        cellSchemas.includes(m.schema) &&
        typeof m.name === 'string' &&
        m.name.length > 0 &&
        !names.has(m.name) &&
        ['foundation', 'optional', 'infrastructure'].includes(
          m.entitlementType
        ) &&
        Array.isArray(m.migrations),
      'INVALID_REGISTRY'
    );
    names.add(m.name);
    for (const migration of m.migrations) {
      requireCondition(
        typeof migration.id === 'string' &&
          migration.id.length > 0 &&
          !ids.has(migration.id) &&
          typeof migration.up === 'function' &&
          /^[a-f0-9]{64}$/.test(migration.checksum),
        'INVALID_REGISTRY'
      );
      ids.add(migration.id);
    }
    requireCondition(declaresCapabilities(m), 'INVALID_REGISTRY');
    requireCondition(
      m.models && typeof m.models === 'object',
      'INVALID_REGISTRY'
    );
    for (const [table, Model] of Object.entries(m.models))
      requireCondition(
        typeof Model === 'function' &&
          Model.prototype instanceof TableModel &&
          Model.schema?.dbSchema === m.schema &&
          Model.schema.table === table,
        'INVALID_REGISTRY'
      );
  }
  return modules;
}

/**
 * Whether a descriptor's `capabilities` pass M0003-R005.
 * @param {object} descriptor
 * @returns {boolean}
 */
function declaresCapabilities(descriptor) {
  try {
    parseDeclarations(descriptor);
    return true;
  } catch {
    return false;
  }
}
