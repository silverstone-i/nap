/**
 * @file Schema definition for tenant-scope ar_clients table
 * @module ar/schemas/arClientsSchema
 *
 * Extended client model with client_code, email, phone, tax_id,
 * and source_id for polymorphic address/contact linking via the sources table.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const arClientsSchema = {
  dbSchema: 'tenantid',
  table: 'ar_clients',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'source_id', type: 'uuid' },
    { name: 'client_code', type: 'varchar(12)', notNull: true },
    { name: 'name', type: 'varchar(255)', notNull: true },
    { name: 'email', type: 'varchar(128)' },
    { name: 'phone', type: 'varchar(32)' },
    { name: 'tax_id', type: 'varchar(64)' },
    { name: 'is_active', type: 'boolean', notNull: true, default: true },
    { name: 'notes', type: 'text' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'client_code']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['source_id'],
        references: { table: 'sources', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['tenant_id', 'client_code'], unique: true, where: 'deactivated_at IS NULL' },
    ],
  },
};

export default arClientsSchema;
