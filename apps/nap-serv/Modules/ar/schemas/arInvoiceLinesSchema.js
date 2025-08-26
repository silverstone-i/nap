'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

const arInvoiceLinesSchema = {
  dbSchema: 'tenantid',
  table: 'ar_invoice_lines',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
    indexes: [
      { type: 'Index', columns: ['invoice_id'] },
      { type: 'Index', columns: ['account_id'] },
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['invoice_id'],
        references: { table: 'ar_invoices', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['account_id'],
        references: { table: 'chart_of_accounts', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
  },

  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', nullable: false, immutable: true },
    { name: 'tenant_id', type: 'uuid', nullable: false },

    { name: 'invoice_id', type: 'uuid', nullable: false },
    { name: 'account_id', type: 'uuid', nullable: false },

    { name: 'description', type: 'text', nullable: true },
    { name: 'amount', type: 'numeric(12,2)', nullable: false },
  ],
};

export default arInvoiceLinesSchema;
