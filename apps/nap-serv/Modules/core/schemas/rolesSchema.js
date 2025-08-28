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
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', default: null },
    { name: 'code', type: 'varchar(64)', notNull: true },
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'description', type: 'varchar(255)', default: null },
    { name: 'is_system', type: 'boolean', notNull: true, default: false },
    { name: 'is_immutable', type: 'boolean', notNull: true, default: false },
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
