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
  table: 'change_orders',
  version: '0.1.0',
  hasAuditFields: true,
  softDelete: true,

  columns: [
    { name: 'id', type: 'uuid', nullable: false, default: 'gen_random_uuid()', immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', nullable: false, colProps: { skip: c => !c.exists } },
    { name: 'unit_id', type: 'uuid', nullable: false },
    { name: 'name', type: 'varchar(150)', nullable: false },
    { name: 'description', type: 'text', default: null },
    { name: 'is_option', type: 'boolean', default: false },
    { name: 'option_name', type: 'varchar(100)', nullable: true },
    { name: 'status', type: 'varchar(50)', default: `'draft'` },
    { name: 'created_by', type: 'varchar(150)', nullable: true },
    { name: 'created_at', type: 'timestamptz', default: 'now()' },
  ],

  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['unit_id'],
        references: {
          table: 'units',
          columns: ['id'],
        },
        onDelete: 'cascade',
      },
    ],
  },
};

export default schema;
