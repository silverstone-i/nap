

'use strict';

const receiptsSchema = {
  dbSchema: 'tenantid',
  table: 'receipts',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
    indexes: [
      { type: 'Index', columns: ['client_id'] },
      { type: 'Index', columns: ['ar_invoice_id'] },
      { type: 'Index', columns: ['receipt_date'] },
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['client_id'],
        references: { table: 'tenantid.clients', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['ar_invoice_id'],
        references: { table: 'tenantid.ar_invoices', columns: ['id'] },
        onDelete: 'SET NULL',
      },
    ],
  },

  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', nullable: false, immutable: true },
    { name: 'tenant_id', type: 'uuid', nullable: false },

    { name: 'client_id', type: 'uuid', nullable: false },
    { name: 'ar_invoice_id', type: 'uuid', nullable: true },

    { name: 'receipt_date', type: 'date', nullable: false },
    { name: 'amount', type: 'numeric(12,2)', nullable: false },
    { name: 'method', type: 'varchar(24)', nullable: false }, // e.g. 'check', 'ach', 'wire'
    { name: 'reference', type: 'varchar(64)', nullable: true },
    { name: 'notes', type: 'text', nullable: true },
  ],
};

export default receiptsSchema;