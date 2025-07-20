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
  table: 'export_addresses',
  version: '1.0.0',

  columns: [
    { name: 'source_type', type: 'text', notNull: true },
    { name: 'code', type: 'text', notNull: false },
    { name: 'label', type: 'text', notNull: false },
    { name: 'address_line1', type: 'text', notNull: false },
    { name: 'address_line2', type: 'text', notNull: false },
    { name: 'city', type: 'text', notNull: false },
    { name: 'state', type: 'text', notNull: false },
    { name: 'zip', type: 'text', notNull: false },
    { name: 'country', type: 'text', notNull: false },
  ],
  // No constraints for a view
};

export default exportAddressesSchema;
