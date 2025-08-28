'use strict';
// @ts-check

/*
 * Copyright © 2025-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

/** @typedef {import('pg-schemata/src/schemaTypes').TableSchema} TableSchema */

/**
 * Roles schema (RBAC)
 * Holds system and tenant roles
 * dbSchema: public
 */
/** @type {TableSchema} */
const schema = {
  dbSchema: 'public',
  table: 'roles',
  hasAuditFields: true,
  softDelete: false,
  version: '1.0.0',
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', nullable: false, immutable: true },
    { name: 'tenant_id', type: 'uuid', nullable: true },
    { name: 'tenant_code', type: 'text', nullable: true },
    { name: 'code', type: 'text', nullable: false },
    { name: 'name', type: 'text', nullable: false },
    { name: 'description', type: 'text', nullable: true },
    { name: 'is_system', type: 'boolean', default: false, nullable: false },
    { name: 'is_immutable', type: 'boolean', default: false, nullable: false },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'code']],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['code'] },
    ],
  },
};

export default schema;
