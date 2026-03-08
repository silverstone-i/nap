/**
 * @file Schema definition for tenant-scope phone_numbers table
 * @module core/schemas/phoneNumbersSchema
 *
 * Phone numbers are linked to vendors, clients, employees, and contacts
 * via the polymorphic sources table (source_id FK with CASCADE delete).
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const phoneNumbersSchema = {
  dbSchema: 'tenantid',
  table: 'phone_numbers',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'source_id', type: 'uuid', notNull: true },
    { name: 'phone_type', type: 'varchar(16)', notNull: true, default: 'cell' },
    { name: 'phone_number', type: 'varchar(32)', notNull: true },
    { name: 'is_primary', type: 'boolean', notNull: true, default: false },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      { type: 'Check', columns: ['phone_type'], expression: "phone_type IN ('cell', 'work', 'home', 'fax', 'other')" },
    ],
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

export default phoneNumbersSchema;
