// @ts-check

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

/** @typedef {import('pg-schemata/src/schemaTypes').TableSchema} TableSchema */

/** @type {TableSchema} */
const schema = {
  dbSchema: 'tenantid',
  table: 'clients',
  version: '0.1.0',
  hasAuditFields: true,
  softDelete: true,

  columns: [
    {
      name: 'id',
      type: 'uuid',
      nullable: false,
      immutable: true,
      default: 'gen_random_uuid()',
    },
    {
      name: 'tenant_code',
      type: 'varchar(6)',
      nullable: false,
      colProps: { skip: c => !c.exists },
    },
    {
      name: 'name',
      type: 'varchar(150)',
      nullable: false,
    },
    {
      name: 'contact_name',
      type: 'varchar(150)',
      default: null,
    },
    {
      name: 'email',
      type: 'varchar(255)',
      default: null,
    },
    {
      name: 'phone',
      type: 'varchar(50)',
      default: null,
    },
    {
      name: 'address',
      type: 'jsonb',
      default: `'{}'`,
      colProps: { mod: ':json', skip: c => !c.exists },
    },
    {
      name: 'payment_terms',
      type: 'varchar(50)',
      default: `'Net 30'`,
    },
    {
      name: 'holdback_percent',
      type: 'numeric(5,2)',
      default: 0,
    },
    {
      name: 'invoice_milestone_type',
      type: 'varchar(50)',
      default: `'milestone'`,
    },
    {
      name: 'tax_id',
      type: 'varchar(30)',
      default: null,
    },
  ],

  constraints: {
    primaryKey: ['id'],
    unique: [['name']],
    checks: [
      {
        type: 'Check',
        columns: ['name'],
        expression: `char_length(name) > 2`,
      },
      {
        type: 'Check',
        columns: ['holdback_percent'],
        expression: `holdback_percent >= 0 AND holdback_percent <= 100`,
      },
    ],
  },
};

export default schema;
