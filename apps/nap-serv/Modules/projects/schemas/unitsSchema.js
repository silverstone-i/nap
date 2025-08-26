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
      default: 'uuidv7()',
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
      name: 'template_unit_id',
      type: 'uuid',
      notNull: true,
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
    {
      name: 'status',
      type: 'varchar(20)',
      notNull: true,
      default: 'draft',
    },
    {
      name: 'start_date',
      type: 'date',
    },
    {
      name: 'end_date',
      type: 'date',
      default: null,
    },
    {
      name: 'location',
      type: 'varchar(100)',
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
    unique: [['name']],
    checks: [
      {
        type: 'Check',
        columns: ['status'],
        expression: `status IN ('draft', 'in_progress', 'complete')`,
      },
    ],
  },
};

export default schema;
