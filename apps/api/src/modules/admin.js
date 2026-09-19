/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';
import { descriptor } from './admin-tenancy/descriptor.js';
import { requireCondition } from '../application/shared/errors.js';
/** Admin database module registry. Every descriptor targets the `admin` schema. */
export const adminModules = [descriptor];
/**
 * Validate the admin module registry before any database connection opens.
 *
 * Rejects a descriptor that targets another database or schema, repeats a
 * module name or migration ID, lacks a migration array, uses an unknown
 * `entitlementType`, or registers a model whose schema targets another
 * PostgreSQL schema or table name.
 * @param {object[]} [modules=adminModules] Module descriptors to check.
 * @returns {object[]} The same array when valid.
 * @throws {MaintenanceError} `INVALID_REGISTRY` on the first violation.
 */
export function validateAdminRegistry(modules = adminModules) {
  const names = new Set();
  const ids = new Set();
  requireCondition(
    Array.isArray(modules) && modules.length > 0,
    'INVALID_REGISTRY'
  );
  for (const m of modules) {
    requireCondition(
      m.databaseTarget === 'admin' &&
        m.schema === 'admin' &&
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
    requireCondition(
      m.models && typeof m.models === 'object',
      'INVALID_REGISTRY'
    );
    for (const [table, Model] of Object.entries(m.models))
      requireCondition(
        typeof Model === 'function' &&
          Model.prototype instanceof TableModel &&
          Model.schema?.dbSchema === 'admin' &&
          Model.schema.table === table,
        'INVALID_REGISTRY'
      );
  }
  return modules;
}
