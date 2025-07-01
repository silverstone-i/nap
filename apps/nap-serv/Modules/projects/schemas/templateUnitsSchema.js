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
  table: 'unit_templates',
  version: '0.1.0',
  hasAuditFields: true,
  softDelete: true,

  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      immutable: true,
      default: 'gen_random_uuid()',
    },
    {
      name: 'tenant_code',
      type: 'varchar(6)',
      notNull: true,
      colProps: { skip: c => !c.exists },
    },
    {
      name: 'name',
      type: 'varchar(150)',
      notNull: true,
    },
    {
      name: 'template_type',
      type: 'varchar(50)',
      notNull: true,
    },
    {
      name: 'version',
      type: 'integer',
      notNull: true,
      default: 1,
    },
    {
      name: 'status',
      type: 'varchar(50)',
      notNull: true,
      default: `'draft'`,
    },
  ],

  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_code', 'name', 'version']],
  },
};

export default schema;
