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
const exportAddressesSchema = {
  dbSchema: 'tenantid',
  table: 'vw_export_addresses',
  version: '1.0.0',

  columns: [
    { name: 'source_type', type: 'varchar(12)', notNull: true },
    { name: 'code', type: 'varchar(12)', notNull: false },
    { name: 'label', type: 'varchar(64)', notNull: false },
    { name: 'address_line1', type: 'varchar(255)', notNull: false },
    { name: 'address_line2', type: 'varchar(255)', notNull: false },
    { name: 'city', type: 'varchar(128)', notNull: false },
    { name: 'state', type: 'varchar(64)', notNull: false },
    { name: 'zip', type: 'varchar(16)', notNull: false },
    { name: 'country', type: 'varchar(64)', notNull: false },
  ],
  // No constraints for a view
};

export default exportAddressesSchema;
