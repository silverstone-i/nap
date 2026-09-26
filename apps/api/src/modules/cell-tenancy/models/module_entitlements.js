/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { CopyTableModel } from './copyTableModel.js';

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

/** Model for `cell.module_entitlements`: a copy kept in step by the sync worker (I0004). */
export class ModuleEntitlements extends CopyTableModel {
  static schema = moduleEntitlementsSchema;
  static copyColumns = ['tenant_id', 'module', 'enabled'];
  constructor(db, pgp, logger) {
    super(db, pgp, moduleEntitlementsSchema, logger);
  }
}
