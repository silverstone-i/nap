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
  table: 'vw_export_contacts',
  version: '1.0.0',

  columns: [
    { name: 'source_type', type: 'varchar(12)', notNull: true },
    { name: 'code', type: 'varchar(12)', notNull: false },
    { name: 'label', type: 'varchar(64)', notNull: true },
    { name: 'name', type: 'varchar(255)', notNull: true },
    { name: 'email', type: 'varchar(255)', notNull: true },
    { name: 'phone', type: 'varchar(32)' },
    { name: 'mobile', type: 'varchar(32)' },
    { name: 'fax', type: 'varchar(32)' },
    { name: 'position', type: 'varchar(128)' },
  ],
};

export default schema;
