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
    { name: 'id', type: 'uuid', default: 'uuidv7()', nullable: false, immutable: true },
    { name: 'tenant_id', type: 'uuid', nullable: true },
    { name: 'tenant_code', type: 'text', nullable: true },
    { name: 'role_id', type: 'uuid', nullable: false },
    { name: 'module', type: 'text', nullable: false },
    { name: 'router', type: 'text', nullable: true },
    { name: 'action', type: 'text', nullable: true },
    { name: 'level', type: 'text', nullable: false },
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
