'use strict';
// @ts-check

/*
 * Copyright © 2025-present, Ian Silverstone
 */

/** @typedef {import('pg-schemata/src/schemaTypes').TableSchema} TableSchema */

/** @type {TableSchema} */
const schema = {
  dbSchema: 'public',
  table: 'policies',
  hasAuditFields: true,
  softDelete: false,
  version: '1.0.0',
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true },
    { name: 'tenant_id', type: 'uuid', default: null },
    { name: 'tenant_code', type: 'text', default: null },
    { name: 'role_id', type: 'uuid', notNull: true },
    { name: 'module', type: 'text', notNull: true },
    { name: 'router', type: 'text', default: null },
    { name: 'action', type: 'text', default: null },
    { name: 'level', type: 'text', notNull: true, colProps: { validator: (/** @type {string} */ v) => ['none', 'view', 'full'].includes(v) } },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['role_id', 'module', 'router', 'action']],
    checks: [{ type: 'Check', expression: "(level IN ('none','view','full'))" }],
    indexes: [
      { type: 'Index', columns: ['role_id'] },
      { type: 'Index', columns: ['module', 'router', 'action'] },
    ],
  },
};

export default schema;
