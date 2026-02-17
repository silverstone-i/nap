/**
 * @file Schema definition for tenant-scope inter_company_transactions table
 * @module accounting/schemas/interCompanyTransactionsSchema
 *
 * Paired journal entry references for intercompany transactions.
 * Module enum: ar, ap, je. Carries elimination flags for consolidation.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const interCompanyTransactionsSchema = {
  dbSchema: 'tenantid',
  table: 'inter_company_transactions',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'source_company_id', type: 'uuid', notNull: true },
    { name: 'target_company_id', type: 'uuid', notNull: true },
    { name: 'source_journal_entry_id', type: 'uuid' },
    { name: 'target_journal_entry_id', type: 'uuid' },
    { name: 'module', type: 'varchar(32)', notNull: true },
    { name: 'amount', type: 'numeric(14,2)', notNull: true, default: 0 },
    { name: 'status', type: 'varchar(16)', notNull: true, default: 'pending' },
    { name: 'is_eliminated', type: 'boolean', notNull: true, default: false },
    { name: 'description', type: 'text' },
  ],
  constraints: {
    primaryKey: ['id'],
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
        columns: ['source_journal_entry_id'],
        references: { table: 'journal_entries', columns: ['id'] },
        onDelete: 'SET NULL',
      },
      {
        type: 'ForeignKey',
        columns: ['target_journal_entry_id'],
        references: { table: 'journal_entries', columns: ['id'] },
        onDelete: 'SET NULL',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['source_company_id'] },
      { type: 'Index', columns: ['target_company_id'] },
      { type: 'Index', columns: ['module'] },
      { type: 'Index', columns: ['status'] },
    ],
  },
};

export default interCompanyTransactionsSchema;
