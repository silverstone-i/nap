'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

const ledgerBalancesSchema = {
  dbSchema: 'tenantid',
  table: 'ledger_balances',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
    indexes: [
      { type: 'Index', columns: ['account_id'] },
      { type: 'Index', columns: ['as_of_date'] },
    ],
    foreignKeys: [
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
    { name: 'account_id', type: 'uuid', nullable: false },
    { name: 'as_of_date', type: 'date', nullable: false },
    { name: 'balance', type: 'numeric(14,2)', nullable: false },
  ],
};

export default ledgerBalancesSchema;