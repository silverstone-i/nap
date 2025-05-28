'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

const postingQueuesSchema = {
  dbSchema: 'tenantid',
  table: 'posting_queue',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
    indexes: [
      { type: 'Index', columns: ['journal_entry_id'] },
      { type: 'Index', columns: ['status'] },
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['journal_entry_id'],
        references: { table: 'journal_entries', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
  },

  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', nullable: false, immutable: true },
    { name: 'tenant_id', type: 'uuid', nullable: false },

    { name: 'journal_entry_id', type: 'uuid', nullable: false },
    { name: 'status', type: 'varchar(16)', default: `'pending'`, nullable: false }, // 'pending', 'posted', 'failed'
    { name: 'error_message', type: 'text', nullable: true },
    { name: 'processed_at', type: 'timestamp', nullable: true },
  ],
};

export default postingQueuesSchema;