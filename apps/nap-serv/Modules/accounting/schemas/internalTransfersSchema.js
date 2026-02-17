/**
 * @file Schema definition for tenant-scope internal_transfers table
 * @module accounting/schemas/internalTransfersSchema
 *
 * Internal fund transfers between accounts within the same company.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const internalTransfersSchema = {
  dbSchema: 'tenantid',
  table: 'internal_transfers',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'from_account_id', type: 'uuid', notNull: true },
    { name: 'to_account_id', type: 'uuid', notNull: true },
    { name: 'transfer_date', type: 'date', notNull: true },
    { name: 'amount', type: 'numeric(14,2)', notNull: true, default: 0 },
    { name: 'description', type: 'text' },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['from_account_id'],
        references: { table: 'chart_of_accounts', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['to_account_id'],
        references: { table: 'chart_of_accounts', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['from_account_id'] },
      { type: 'Index', columns: ['to_account_id'] },
    ],
  },
};

export default internalTransfersSchema;
