/**
 * @file Schema definition for tenant-scope addresses table
 * @module core/schemas/addressesSchema
 *
 * Addresses are linked to vendors, clients, or employees via the polymorphic
 * sources table (source_id FK with CASCADE delete). Field names follow
 * international address best practices per PRD.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const addressesSchema = {
  dbSchema: 'tenantid',
  table: 'addresses',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'source_id', type: 'uuid', notNull: true },
    { name: 'label', type: 'varchar(32)' },
    { name: 'address_line_1', type: 'varchar(255)' },
    { name: 'address_line_2', type: 'varchar(255)' },
    { name: 'address_line_3', type: 'varchar(255)' },
    { name: 'city', type: 'varchar(128)' },
    { name: 'state_province', type: 'varchar(128)' },
    { name: 'postal_code', type: 'varchar(20)' },
    { name: 'country_code', type: 'char(2)' },
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
      { type: 'Index', columns: ['source_id'] },
    ],
  },
};

export default addressesSchema;
