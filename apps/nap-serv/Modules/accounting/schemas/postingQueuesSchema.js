/**
 * @file Schema definition for tenant-scope posting_queues table
 * @module accounting/schemas/postingQueuesSchema
 *
 * Async posting queue for journal entries. Status: pending → posted → failed.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const postingQueuesSchema = {
  dbSchema: 'tenantid',
  table: 'posting_queues',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'journal_entry_id', type: 'uuid', notNull: true },
    { name: 'status', type: 'varchar(16)', notNull: true, default: 'pending' },
    { name: 'error_message', type: 'text' },
    { name: 'processed_at', type: 'timestamptz' },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['journal_entry_id'],
        references: { table: 'journal_entries', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['journal_entry_id'] },
      { type: 'Index', columns: ['status'] },
    ],
  },
};

export default postingQueuesSchema;
