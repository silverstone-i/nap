/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { RevisionedTableModel } from './revisionedTableModel.js';

/**
 * Schema object for `admin.module_entitlements`: the current central decision for one tenant and optional module.
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const moduleEntitlementsSchema = {
  dbSchema: 'admin',
  table: 'module_entitlements',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'module', type: 'text', notNull: true, immutable: true },
    { name: 'enabled', type: 'boolean', notNull: true, default: false },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'module']],
    checks: ['revision > 0'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: { schema: 'admin', table: 'tenants', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [{ columns: ['tenant_id', 'enabled'] }],
  },
};

/**
 * Model for `admin.module_entitlements`. `revisionedColumns` lists the fields
 * copied to cells; `module` is immutable, so only an `enabled` change
 * increments `revision`.
 */
export class ModuleEntitlements extends RevisionedTableModel {
  static schema = moduleEntitlementsSchema;
  static revisionedColumns = ['module', 'enabled'];
  static outboxTopic = 'entitlement';
  static snapshot(row) {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      module: row.module,
      enabled: row.enabled,
    };
  }
  constructor(db, pgp, logger) {
    super(db, pgp, moduleEntitlementsSchema, logger);
  }
}
