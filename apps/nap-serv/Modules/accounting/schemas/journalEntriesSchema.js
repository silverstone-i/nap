'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

// pg-schemata format for journal_entries
const journalEntriesSchema = {
  dbSchema: 'tenantid',
  table: 'journal_entries',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
    indexes: [
      { type: 'Index', columns: ['entry_date'] },
      { type: 'Index', columns: ['status'] },
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['corrects_id'],
        references: { table: 'tenantid.journal_entries', columns: ['id'] },
        onDelete: 'SET NULL',
      },
    ],
  },

  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', nullable: false, immutable: true },
    { name: 'tenant_id', type: 'uuid', nullable: false },

    { name: 'entry_date', type: 'date', nullable: false },
    { name: 'description', type: 'text', nullable: true },
    { name: 'status', type: 'varchar(16)', default: `'pending'`, nullable: false }, // 'pending', 'posted', 'reversed'

    { name: 'source_type', type: 'varchar(32)', nullable: true }, // e.g. 'activity_actual', 'invoice', 'payment', 'activity_adjustment'
    { name: 'source_id', type: 'uuid', nullable: true },

    { name: 'corrects_id', type: 'uuid', nullable: true }, // reversal or adjustment target
  ],
};

module.exports = journalEntriesSchema;
