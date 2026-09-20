/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';
import { descriptor } from './access-control/descriptor.js';
import { requireCondition } from '../application/shared/errors.js';

export const cellModules = [descriptor];

export function validateCellRegistry(modules = cellModules) {
  const names = new Set();
  const migrations = new Set();
  for (const module of modules) {
    requireCondition(
      module.databaseTarget === 'cell' &&
        ['cell', 'reference', 'app', 'reporting'].includes(module.schema) &&
        typeof module.name === 'string' &&
        !names.has(module.name) &&
        Array.isArray(module.migrations),
      'INVALID_REGISTRY'
    );
    names.add(module.name);
    for (const migration of module.migrations) {
      requireCondition(
        typeof migration.id === 'string' &&
          !migrations.has(migration.id) &&
          typeof migration.up === 'function' &&
          /^[a-f0-9]{64}$/.test(migration.checksum),
        'INVALID_REGISTRY'
      );
      migrations.add(migration.id);
    }
    for (const [table, Model] of Object.entries(module.models ?? {}))
      requireCondition(
        typeof Model === 'function' &&
          Model.prototype instanceof TableModel &&
          Model.schema?.dbSchema === module.schema &&
          Model.schema.table === table,
        'INVALID_REGISTRY'
      );
  }
  return modules;
}
