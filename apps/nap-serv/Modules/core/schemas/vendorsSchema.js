'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

const schema = {
  dbSchema: 'tenantid',
  table: 'vendors',
  hasAuditFields: true,
  version: '1.0.0', // Updated version
  softDelete: true, // Added soft delete support
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true },
    { name: 'vendor_code', type: 'varchar(12)', notNull: true },
    { name: 'name', type: 'varchar(255)', notNull: true },
    { name: 'tax_id', type: 'varchar(64)' },
    { name: 'is_1099', type: 'boolean', notNull: true, default: true },
    { name: 'payment_terms', type: 'varchar(64)' },
    { name: 'payment_method', type: 'varchar(64)' },
    // Removed mailing_address_id, physical_address_id, accounting_contact_id, and sales_contact_id
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['name'], ['vendor_code']],
    indexes: [
      {
        type: 'Index',
        columns: ['name'],
      },
      {
        type: 'Index',
        columns: ['vendor_code'],
      },
    ],
  },
};

export default schema;
