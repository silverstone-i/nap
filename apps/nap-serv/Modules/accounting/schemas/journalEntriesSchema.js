/**
 * @file Schema definition for tenant-scope journal_entries table
 * @module accounting/schemas/journalEntriesSchema
 *
 * Journal entries with status workflow: pending → posted → reversed.
 * Self-referential corrects_id supports reversal chains.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const journalEntriesSchema = {
  dbSchema: 'tenantid',
  table: 'journal_entries',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'company_id', type: 'uuid', notNull: true },
    { name: 'project_id', type: 'uuid' },
    { name: 'entry_date', type: 'date', notNull: true },
    { name: 'description', type: 'text' },
    { name: 'status', type: 'varchar(16)', notNull: true, default: 'pending' },
    { name: 'source_type', type: 'varchar(32)' },
    { name: 'source_id', type: 'uuid' },
    { name: 'corrects_id', type: 'uuid' },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['company_id'],
        references: { table: 'inter_companies', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['project_id'],
        references: { table: 'projects', columns: ['id'] },
        onDelete: 'SET NULL',
      },
      {
        type: 'ForeignKey',
        columns: ['corrects_id'],
        references: { table: 'journal_entries', columns: ['id'] },
        onDelete: 'SET NULL',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['company_id'] },
      { type: 'Index', columns: ['project_id'] },
      { type: 'Index', columns: ['status'] },
      { type: 'Index', columns: ['source_type', 'source_id'] },
      { type: 'Index', columns: ['corrects_id'] },
    ],
  },
};

export default journalEntriesSchema;
