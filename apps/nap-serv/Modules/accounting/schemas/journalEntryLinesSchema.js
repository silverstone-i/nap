/**
 * @file Schema definition for tenant-scope journal_entry_lines table
 * @module accounting/schemas/journalEntryLinesSchema
 *
 * Debit/credit lines on journal entries with polymorphic related_table/related_id.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const journalEntryLinesSchema = {
  dbSchema: 'tenantid',
  table: 'journal_entry_lines',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'entry_id', type: 'uuid', notNull: true },
    { name: 'account_id', type: 'uuid', notNull: true },
    { name: 'debit', type: 'numeric(14,2)', notNull: true, default: 0 },
    { name: 'credit', type: 'numeric(14,2)', notNull: true, default: 0 },
    { name: 'memo', type: 'text' },
    { name: 'related_table', type: 'varchar(32)' },
    { name: 'related_id', type: 'uuid' },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['entry_id'],
        references: { table: 'journal_entries', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['account_id'],
        references: { table: 'chart_of_accounts', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['entry_id'] },
      { type: 'Index', columns: ['account_id'] },
    ],
  },
};

export default journalEntryLinesSchema;
