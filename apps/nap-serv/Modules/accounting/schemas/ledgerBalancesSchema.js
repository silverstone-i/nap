/**
 * @file Schema definition for tenant-scope ledger_balances table
 * @module accounting/schemas/ledgerBalancesSchema
 *
 * Running account balances snapshotted by date.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const ledgerBalancesSchema = {
  dbSchema: 'tenantid',
  table: 'ledger_balances',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'account_id', type: 'uuid', notNull: true },
    { name: 'as_of_date', type: 'date', notNull: true },
    { name: 'balance', type: 'numeric(14,2)', notNull: true, default: 0 },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['account_id', 'as_of_date']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['account_id'],
        references: { table: 'chart_of_accounts', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['account_id'] },
      { type: 'Index', columns: ['as_of_date'] },
    ],
  },
};

export default ledgerBalancesSchema;
