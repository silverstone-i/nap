'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

const apInvoiceLinesSchema = {
  dbSchema: 'tenantid',
  table: 'ap_invoice_lines',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
    indexes: [
      { type: 'Index', columns: ['invoice_id'] },
      { type: 'Index', columns: ['cost_line_id'] },
      { type: 'Index', columns: ['account_id'] },
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['invoice_id'],
        references: { table: 'tenantid.ap_invoices', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['cost_line_id'],
        references: { table: 'tenantid.costlines', columns: ['id'] },
        onDelete: 'SET NULL',
      },
      {
        type: 'ForeignKey',
        columns: ['activity_id'],
        references: { table: 'tenantid.activities', columns: ['id'] },
        onDelete: 'SET NULL',
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

    { name: 'invoice_id', type: 'uuid', nullable: false },   // FK to ap_invoices
    { name: 'cost_line_id', type: 'uuid', nullable: true },  // FK to cost_lines
    { name: 'activity_id', type: 'uuid', nullable: true },   // direct link to activity
    { name: 'account_id', type: 'uuid', nullable: false },   // FK to chart_of_accounts

    { name: 'description', type: 'text', nullable: true },
    { name: 'amount', type: 'numeric(12,2)', nullable: false },
  ],
};

export default apInvoiceLinesSchema;