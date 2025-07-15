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
  version: '1.0.0',
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', nullable: false, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', nullable: false },
    { name: 'vendor_code', type: 'varchar(12)', nullable: false },
    { name: 'name', type: 'varchar(255)', nullable: false },
    { name: 'tax_id', type: 'varchar(64)', nullable: true },
    { name: 'mailing_address_id', type: 'uuid', nullable: true },
    { name: 'physical_address_id', type: 'uuid', nullable: true },
    { name: 'accounting_contact_id', type: 'uuid', nullable: true },
    { name: 'sales_contact_id', type: 'uuid', nullable: true },
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
