'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

const arInvoicesSchema = {
  dbSchema: 'tenantid',
  table: 'ar_invoices',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
    indexes: [
      { type: 'Index', columns: ['client_id'] },
      { type: 'Index', columns: ['project_id'] },
      { type: 'Index', columns: ['invoice_date'] },
      { type: 'Index', columns: ['status'] },
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['client_id'],
        references: { table: 'clients', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['deliverable_id'],
        references: { table: 'deliverables', columns: ['id'] },
        onDelete: 'SET NULL',
      },
      {
        type: 'ForeignKey',
        columns: ['company_id'],
        references: { table: 'inter_companies', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
  },

  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', nullable: false, immutable: true },
    { name: 'tenant_id', type: 'uuid', nullable: false },
    { name: 'company_id', type: 'uuid', nullable: false },

    { name: 'client_id', type: 'uuid', nullable: false },
    { name: 'deliverable_id', type: 'uuid', nullable: true },

    { name: 'invoice_number', type: 'varchar(32)', nullable: false },
    { name: 'invoice_date', type: 'date', nullable: false },
    { name: 'due_date', type: 'date', nullable: true },

    { name: 'total_amount', type: 'numeric(12,2)', nullable: false },
    { name: 'status', type: 'varchar(16)', default: `'open'`, nullable: false }, // 'open', 'sent', 'paid', 'voided'

    { name: 'description', type: 'text', nullable: true },
  ],
};

export default arInvoicesSchema;
