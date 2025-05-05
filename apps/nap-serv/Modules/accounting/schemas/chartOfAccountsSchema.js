'use strict';

const chartOfAccountsSchema = {
  dbSchema: 'tenantid',
  table: 'chart_of_accounts',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
    indexes: [
      { type: 'Index', columns: ['code'] },
      { type: 'Index', columns: ['type'] },
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['classification_id'],
        references: { table: 'admin.account_classifications', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
  },

  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', nullable: false, immutable: true },
    { name: 'tenant_id', type: 'uuid', nullable: false },

    { name: 'code', type: 'varchar(16)', nullable: false },
    { name: 'name', type: 'varchar(64)', nullable: false },
    { name: 'classification_id', type: 'varchar(8)', nullable: false },
    { name: 'type', type: 'varchar(16)', nullable: false }, // asset, liability, equity, income, expense, cash, bank

    { name: 'description', type: 'text', nullable: true },
    { name: 'is_active', type: 'boolean', default: true, nullable: false },
    { name: 'cash_basis', type: 'boolean', default: false, nullable: false },

    // Bank account fields for type = 'cash' or 'bank'
    { name: 'bank_account_number', type: 'varchar(32)', nullable: true },
    { name: 'routing_number', type: 'varchar(16)', nullable: true },
    { name: 'bank_name', type: 'varchar(64)', nullable: true },
  ],
};

export default chartOfAccountsSchema;
