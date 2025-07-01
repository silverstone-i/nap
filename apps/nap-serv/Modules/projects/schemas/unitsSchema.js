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
  table: 'units',
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
      name: 'project_id',
      type: 'uuid',
      notNull: true,
    },
    {
      name: 'template_id',
      type: 'uuid',
    },
    {
      name: 'version_used',
      type: 'integer',
    },
    {
      name: 'name',
      type: 'varchar(150)',
      notNull: true,
    },
    {
      name: 'description',
      type: 'text',
      default: null,
    },
  ],

  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['project_id'],
        references: {
          table: 'projects',
          columns: ['id'],
        },
        onDelete: 'cascade',
      },
    ],
    unique: [['tenant_code', 'name']],
  },
};

export default schema;
