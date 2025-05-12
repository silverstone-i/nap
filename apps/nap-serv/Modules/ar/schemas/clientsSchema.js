'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import { v4 as uuid } from 'uuid';

const schema = {
  dbSchema: 'tenantid',
  table: 'clients',
  hasAuditFields: true,
  version: '1.0.0',
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['billing_address_id'],
        references: { table: 'tenantid.addresses', columns: ['id'] },
        onDelete: 'SET NULL'
      },
      {
        type: 'ForeignKey',
        columns: ['physical_address_id'],
        references: { table: 'tenantid.addresses', columns: ['id'] },
        onDelete: 'SET NULL'
      },
      {
        type: 'ForeignKey',
        columns: ['primary_contact_id'],
        references: { table: 'tenantid.contacts', columns: ['id'] },
        onDelete: 'SET NULL'
      }
    ],
    unique: [['tenant_id', 'name'], ['tenant_id', 'client_code']],
    indexes: [
      { type: 'Index', columns: ['tenant_id', 'name'] },
      { type: 'Index', columns: ['email'] },
      { type: 'Index', columns: ['tenant_id', 'client_code'] },
    ],
  },
  columns: [
    {
      name: 'id',
      type: 'uuid',
      default: 'uuidv7()',
      nullable: false,
      immutable: true,
      colProps: { cnd: true },
    },
    { name: 'tenant_id', type: 'uuid', nullable: false },
    { name: 'client_code', type: 'varchar(12)', nullable: false },

    { name: 'name', type: 'varchar(255)', nullable: false },
    { name: 'email', type: 'varchar(128)', nullable: true },
    { name: 'phone', type: 'varchar(32)', nullable: true },
    { name: 'tax_id', type: 'varchar(64)', nullable: true },

    { name: 'billing_address_id', type: 'uuid', nullable: true },
    { name: 'physical_address_id', type: 'uuid', nullable: true },
    { name: 'primary_contact_id', type: 'uuid', nullable: true },

    { name: 'notes', type: 'text', nullable: true },
  ],
  beforeHook: async (ctx) => {
    const { db } = await import('../../../src/db/db.js');
    ctx.tenantId = uuid();
    ctx.addressId1 = uuid();
    ctx.addressId2 = uuid();
    ctx.contactId = uuid();

    await db.none(`INSERT INTO tenantid.addresses (id, tenant_id, created_by) VALUES ($1, $2, $3)`, [
      ctx.addressId1, ctx.tenantId, 'integration-test'
    ]);

    await db.none(`INSERT INTO tenantid.addresses (id, tenant_id, created_by) VALUES ($1, $2, $3)`, [
      ctx.addressId2, ctx.tenantId, 'integration-test'
    ]);

    await db.none(`INSERT INTO tenantid.contacts (id, tenant_id, created_by) VALUES ($1, $2, $3)`, [
      ctx.contactId, ctx.tenantId, 'integration-test'
    ]);
  },
  testRecord: (ctx) => ({
    tenant_id: ctx.tenantId,
    client_code: 'CLNT1001',
    name: 'Sample Client',
    email: 'client@example.com',
    phone: '123-456-7890',
    tax_id: 'TAX123456',
    billing_address_id: ctx.addressId1,
    physical_address_id: ctx.addressId2,
    primary_contact_id: ctx.contactId,
    created_by: 'integration-test',
    updated_by: 'integration-test',
  }),
};

export default schema;
