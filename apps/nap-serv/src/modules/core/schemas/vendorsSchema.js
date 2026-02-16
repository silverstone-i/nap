/**
 * @file Schema definition for tenant-scope vendors table
 * @module core/schemas/vendorsSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const vendorsSchema = {
  dbSchema: 'tenantid',
  table: 'vendors',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'source_id', type: 'uuid' },
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'code', type: 'varchar(16)' },
    { name: 'tax_id', type: 'varchar(32)' },
    { name: 'payment_terms', type: 'varchar(32)' },
    { name: 'is_active', type: 'boolean', notNull: true, default: true },
    { name: 'notes', type: 'text' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'code']],
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
      { type: 'Index', columns: ['tenant_id', 'code'], unique: true, where: 'deactivated_at IS NULL' },
    ],
  },
};

export default vendorsSchema;
