/**
 * @file Schema definition for tenant-scope category_account_map table
 * @module accounting/schemas/categoryAccountMapSchema
 *
 * Maps cost categories to GL accounts with date-range validity.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const categoryAccountMapSchema = {
  dbSchema: 'tenantid',
  table: 'category_account_map',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'category_id', type: 'uuid', notNull: true },
    { name: 'account_id', type: 'uuid', notNull: true },
    { name: 'valid_from', type: 'date', notNull: true },
    { name: 'valid_to', type: 'date' },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['category_id'],
        references: { table: 'categories', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['account_id'],
        references: { table: 'chart_of_accounts', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['category_id'] },
      { type: 'Index', columns: ['account_id'] },
    ],
  },
};

export default categoryAccountMapSchema;
