'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

const interCompanyAccountsSchema = {
  dbSchema: 'tenantid',
  table: 'inter_company_accounts',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'source_company_id', 'target_company_id']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['source_company_id'],
        references: { table: 'inter_companies', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['target_company_id'],
        references: { table: 'inter_companies', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['inter_company_account_id'],
        references: { table: 'chart_of_accounts', columns: ['id'] },
        onDelete: 'RESTRICT',
      }
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id', 'source_company_id'] },
      { type: 'Index', columns: ['tenant_id', 'target_company_id'] }
    ]
  },

  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', nullable: false, immutable: true },
    { name: 'tenant_id', type: 'uuid', nullable: false },
    { name: 'source_company_id', type: 'uuid', nullable: false },
    { name: 'target_company_id', type: 'uuid', nullable: false },
    { name: 'inter_company_account_id', type: 'uuid', nullable: false },
    { name: 'description', type: 'text', nullable: true },
    { name: 'is_active', type: 'boolean', nullable: false, default: true }
  ]
};

export default interCompanyAccountsSchema;
