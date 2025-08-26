'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

const apCreditMemosSchema = {
  dbSchema: 'tenantid',
  table: 'ap_credit_memos',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
    indexes: [
      { type: 'Index', columns: ['vendor_id'] },
      { type: 'Index', columns: ['ap_invoice_id'] },
      { type: 'Index', columns: ['credit_date'] },
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['vendor_id'],
        references: { table: 'vendors', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['ap_invoice_id'],
        references: { table: 'ap_invoices', columns: ['id'] },
        onDelete: 'SET NULL',
      },
    ],
  },

  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', nullable: false, immutable: true },
    { name: 'tenant_id', type: 'uuid', nullable: false },

    { name: 'vendor_id', type: 'uuid', nullable: false },
    { name: 'ap_invoice_id', type: 'uuid', nullable: true },

    { name: 'credit_number', type: 'varchar(32)', nullable: false },
    { name: 'credit_date', type: 'date', nullable: false },
    { name: 'amount', type: 'numeric(12,2)', nullable: false },
    { name: 'description', type: 'text', nullable: true },
    { name: 'status', type: 'varchar(16)', default: `'open'`, nullable: false }, // 'open', 'applied', 'voided'
  ],
};

export default apCreditMemosSchema;
