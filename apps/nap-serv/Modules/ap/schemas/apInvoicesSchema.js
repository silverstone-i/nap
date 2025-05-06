'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

const apInvoicesSchema = {
  dbSchema: 'tenantid',
  table: 'ap_invoices',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
    indexes: [
      { type: 'Index', columns: ['vendor_id'] },
      { type: 'Index', columns: ['project_id'] },
      { type: 'Index', columns: ['invoice_date'] },
      { type: 'Index', columns: ['status'] },
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['vendor_id'],
        references: { table: 'tenantid.vendors', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['project_id'],
        references: { table: 'tenantid.projects', columns: ['id'] },
        onDelete: 'SET NULL',
      },
      {
        type: 'ForeignKey',
        columns: ['company_id'],
        references: { table: 'tenantid.inter_companies', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
  },

  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', nullable: false, immutable: true },
    { name: 'tenant_id', type: 'uuid', nullable: false },
    { name: 'company_id', type: 'uuid', nullable: false },

    { name: 'vendor_id', type: 'uuid', nullable: false },
    { name: 'project_id', type: 'uuid', nullable: true },

    { name: 'invoice_number', type: 'varchar(32)', nullable: false },
    { name: 'invoice_date', type: 'date', nullable: false },
    { name: 'due_date', type: 'date', nullable: true },

    { name: 'total_amount', type: 'numeric(12,2)', nullable: false },
    { name: 'status', type: 'varchar(16)', default: `'open'`, nullable: false }, // 'open', 'approved', 'paid', 'voided'

    { name: 'description', type: 'text', nullable: true },
  ],
};

export default apInvoicesSchema;