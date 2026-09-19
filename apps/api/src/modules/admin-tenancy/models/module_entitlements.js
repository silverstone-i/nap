/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

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

export class ModuleEntitlements extends TableModel {
  static schema = moduleEntitlementsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, moduleEntitlementsSchema, logger);
  }
}
