'use strict';
// @ts-check

/*
 * Copyright © 2025-present, Ian Silverstone
 */

/** @typedef {import('pg-schemata/src/schemaTypes').TableSchema} TableSchema */

/** @type {TableSchema} */
const schema = {
  dbSchema: 'public',
  table: 'role_members',
  hasAuditFields: true,
  softDelete: false,
  version: '1.0.0',
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', nullable: false, immutable: true },
    { name: 'tenant_id', type: 'uuid', nullable: true },
    { name: 'tenant_code', type: 'text', nullable: true },
    { name: 'role_id', type: 'uuid', nullable: false },
    { name: 'user_id', type: 'uuid', nullable: false },
    { name: 'is_primary', type: 'boolean', default: false, nullable: false },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['role_id', 'user_id']],
    indexes: [
      { type: 'Index', columns: ['role_id'] },
      { type: 'Index', columns: ['user_id'] },
      { type: 'Index', columns: ['tenant_id'] },
    ],
  },
};

export default schema;
