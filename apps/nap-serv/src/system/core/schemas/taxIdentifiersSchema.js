/**
 * @file Tax identifiers schema — typed tax IDs linked to entities via sources
 * @module core/schemas/taxIdentifiersSchema
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

const taxIdentifiersSchema = {
  dbSchema: 'tenantid',
  table: 'tax_identifiers',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'source_id', type: 'uuid', notNull: true },
    { name: 'country_code', type: 'char(2)', notNull: true },
    { name: 'tax_type', type: 'varchar(16)', notNull: true },
    { name: 'tax_value', type: 'varchar(64)', notNull: true },
    { name: 'is_primary', type: 'boolean', notNull: true, default: false },
  ],
  constraints: {
    primaryKey: ['id'],
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
      { type: 'Index', columns: ['source_id'] },
      {
        type: 'Index',
        columns: ['source_id', 'country_code', 'tax_type'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
    ],
  },
};

export default taxIdentifiersSchema;
