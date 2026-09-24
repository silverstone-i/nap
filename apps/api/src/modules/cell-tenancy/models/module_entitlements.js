/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `cell.module_entitlements`: a copy of `admin.module_entitlements` for the tenants in this cell.
 * Kept identical to the copy frozen in migration `001-cell-tenancy`.
 */
export const moduleEntitlementsSchema = {
  dbSchema: 'cell',
  table: 'module_entitlements',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  columns: [
    { name: 'id', type: 'uuid', notNull: true, immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'module', type: 'text', notNull: true, immutable: true },
    { name: 'enabled', type: 'boolean', notNull: true, default: false },
    { name: 'revision', type: 'integer', notNull: true },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'module']],
    checks: ['revision > 0'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: { schema: 'cell', table: 'tenants', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
  },
};

/** Model for `cell.module_entitlements`. Inherits the standard table operations only. */
export class ModuleEntitlements extends TableModel {
  static schema = moduleEntitlementsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, moduleEntitlementsSchema, logger);
  }
}
