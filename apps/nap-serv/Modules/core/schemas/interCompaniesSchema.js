'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

const interCompaniesSchema = {
  dbSchema: 'tenantid',
  table: 'inter_companies',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'company_code']],
    indexes: [
      { type: 'Index', columns: ['tenant_id', 'company_code'] }
    ]
  },

  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', nullable: false, immutable: true },
    { name: 'tenant_id', type: 'uuid', nullable: false },
    { name: 'company_code', type: 'varchar(8)', nullable: false },
    { name: 'company_name', type: 'varchar(64)', nullable: false },
    { name: 'description', type: 'text', nullable: true },
    { name: 'is_active', type: 'boolean', nullable: false, default: true }
  ]
};

export default interCompaniesSchema;
