'use strict';

const journalEntryLinesSchema = {
  dbSchema: 'tenantid',
  table: 'journal_entry_lines',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
    indexes: [
      { type: 'Index', columns: ['entry_id'] },
      { type: 'Index', columns: ['account_id'] },
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['entry_id'],
        references: { table: 'tenantid.journal_entries', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['account_id'],
        references: { table: 'tenantid.chart_of_accounts', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
  },

  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', nullable: false, immutable: true },
    { name: 'tenant_id', type: 'uuid', nullable: false },

    { name: 'entry_id', type: 'uuid', nullable: false },      // FK to journal_entries.id
    { name: 'account_id', type: 'uuid', nullable: false },    // FK to chart_of_accounts.id

    { name: 'debit', type: 'numeric(12,2)', nullable: false, default: 0 },
    { name: 'credit', type: 'numeric(12,2)', nullable: false, default: 0 },

    { name: 'memo', type: 'text', nullable: true },

    // Optional link back to source detail
    { name: 'related_table', type: 'varchar(32)', nullable: true }, // e.g. 'activity_actuals'
    { name: 'related_id', type: 'uuid', nullable: true },
  ],
};

export default journalEntryLinesSchema;
