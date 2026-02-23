/**
 * @file Schema definition for tenant-scope sources table (polymorphic link)
 * @module core/schemas/sourcesSchema
 *
 * Discriminated union linking vendors, clients, and employees to shared
 * contacts and addresses via source_type + table_id.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const sourcesSchema = {
  dbSchema: 'tenantid',
  table: 'sources',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'table_id', type: 'uuid', notNull: true },
    { name: 'source_type', type: 'varchar(32)', notNull: true },
    { name: 'label', type: 'varchar(64)' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['table_id', 'source_type']],
    checks: [
      { type: 'Check', columns: ['source_type'], expression: "source_type IN ('vendor', 'client', 'employee')" },
    ],
    indexes: [
      { type: 'Index', columns: ['table_id', 'source_type'] },
      { type: 'Index', columns: ['tenant_id'] },
    ],
  },
};

export default sourcesSchema;
