/**
 * @file Schema definition for tenant-scope chart_of_accounts table
 * @module accounting/schemas/chartOfAccountsSchema
 *
 * GL accounts with type enum. Cash/bank types include bank fields.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const chartOfAccountsSchema = {
  dbSchema: 'tenantid',
  table: 'chart_of_accounts',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'code', type: 'varchar(16)', notNull: true },
    { name: 'name', type: 'varchar(64)', notNull: true },
    { name: 'type', type: 'varchar(16)', notNull: true },
    { name: 'is_active', type: 'boolean', notNull: true, default: true },
    { name: 'cash_basis', type: 'boolean', notNull: true, default: false },
    { name: 'bank_account_number', type: 'varchar(32)' },
    { name: 'routing_number', type: 'varchar(16)' },
    { name: 'bank_name', type: 'varchar(64)' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'code']],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['type'] },
      { type: 'Index', columns: ['tenant_id', 'code'], unique: true, where: 'deactivated_at IS NULL' },
    ],
  },
};

export default chartOfAccountsSchema;
