'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

const interCompanyTransactionsSchema = {
  dbSchema: 'tenantid',
  table: 'inter_company_transactions',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['source_company_id'],
        references: { table: 'tenantid.inter_companies', columns: ['id'] },
        onDelete: 'RESTRICT'
      },
      {
        type: 'ForeignKey',
        columns: ['target_company_id'],
        references: { table: 'tenantid.inter_companies', columns: ['id'] },
        onDelete: 'RESTRICT'
      },
      {
        type: 'ForeignKey',
        columns: ['source_journal_entry_id'],
        references: { table: 'tenantid.journal_entries', columns: ['id'] },
        onDelete: 'SET NULL'
      },
      {
        type: 'ForeignKey',
        columns: ['target_journal_entry_id'],
        references: { table: 'tenantid.journal_entries', columns: ['id'] },
        onDelete: 'SET NULL'
      }
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id', 'source_company_id'] },
      { type: 'Index', columns: ['tenant_id', 'target_company_id'] }
    ]
  },

  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', nullable: false, immutable: true },
    { name: 'tenant_id', type: 'uuid', nullable: false },
    { name: 'source_company_id', type: 'uuid', nullable: false },
    { name: 'target_company_id', type: 'uuid', nullable: false },
    { name: 'source_journal_entry_id', type: 'uuid', nullable: true },
    { name: 'target_journal_entry_id', type: 'uuid', nullable: true },
    { name: 'module', type: 'varchar(32)', nullable: false }, // e.g. 'ar', 'ap', 'je'
    { name: 'status', type: 'varchar(16)', nullable: false, default: "'pending'" },
    { name: 'description', type: 'text', nullable: true }
  ]
};

export default interCompanyTransactionsSchema;
