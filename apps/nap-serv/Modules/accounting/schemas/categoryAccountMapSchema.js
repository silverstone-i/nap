

'use strict';

const categoryAccountMapSchema = {
  dbSchema: 'tenantid',
  table: 'category_account_map',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
    indexes: [
      { type: 'Index', columns: ['category_id'] },
      { type: 'Index', columns: ['account_id'] },
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['category_id'],
        references: { table: 'tenantid.categories', columns: ['id'] },
        onDelete: 'RESTRICT',
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

    { name: 'category_id', type: 'uuid', nullable: false },
    { name: 'account_id', type: 'uuid', nullable: false },

    { name: 'valid_from', type: 'date', nullable: true },
    { name: 'valid_to', type: 'date', nullable: true },
  ],
};

export default categoryAccountMapSchema;