/**
 * @file Schema definition for tenant-scope inter_company_accounts table
 * @module accounting/schemas/interCompanyAccountsSchema
 *
 * Maps intercompany pairs to their due-to/due-from GL account.
 * Unique constraint: (tenant_id, source_company_id, target_company_id).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const interCompanyAccountsSchema = {
  dbSchema: 'tenantid',
  table: 'inter_company_accounts',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'source_company_id', type: 'uuid', notNull: true },
    { name: 'target_company_id', type: 'uuid', notNull: true },
    { name: 'inter_company_account_id', type: 'uuid', notNull: true },
    { name: 'is_active', type: 'boolean', notNull: true, default: true },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'source_company_id', 'target_company_id']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['source_company_id'],
        references: { table: 'inter_companies', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['target_company_id'],
        references: { table: 'inter_companies', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['inter_company_account_id'],
        references: { table: 'chart_of_accounts', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['source_company_id'] },
      { type: 'Index', columns: ['target_company_id'] },
    ],
  },
};

export default interCompanyAccountsSchema;
