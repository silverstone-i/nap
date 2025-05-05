'use strict';

const internalTransfersSchema = {
  dbSchema: 'tenantid',
  table: 'internal_transfers',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
    indexes: [
      { type: 'Index', columns: ['from_account_id'] },
      { type: 'Index', columns: ['to_account_id'] },
      { type: 'Index', columns: ['transfer_date'] },
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['from_account_id'],
        references: { table: 'tenantid.chart_of_accounts', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['to_account_id'],
        references: { table: 'tenantid.chart_of_accounts', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
  },

  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', nullable: false, immutable: true },
    { name: 'tenant_id', type: 'uuid', nullable: false },

    { name: 'from_account_id', type: 'uuid', nullable: false },
    { name: 'to_account_id', type: 'uuid', nullable: false },

    { name: 'transfer_date', type: 'date', nullable: false },
    { name: 'amount', type: 'numeric(12,2)', nullable: false },
    { name: 'description', type: 'text', nullable: true },
  ],
};

export default internalTransfersSchema;
