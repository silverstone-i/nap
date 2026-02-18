/**
 * @file Schema definition for tenant-scope policy_catalog table (RBAC)
 * @module core/schemas/policyCatalogSchema
 *
 * Read-only registry of all valid module/router/action combinations.
 * Seeded at bootstrap — administrators query this to discover available
 * permissions when configuring roles.
 *
 * No audit fields or tenant_code — this is static application-level
 * reference data, identical across all tenants.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const policyCatalogSchema = {
  dbSchema: 'public',
  table: 'policy_catalog',
  version: '1.0.0',
  hasAuditFields: { enabled: false },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'module', type: 'varchar(32)', notNull: true },
    { name: 'router', type: 'varchar(64)', default: null },
    { name: 'action', type: 'varchar(64)', default: null },
    { name: 'label', type: 'varchar(128)', notNull: true },
    { name: 'description', type: 'varchar(512)', default: null },
    { name: 'sort_order', type: 'integer', notNull: true, default: 0 },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['module', 'router', 'action']],
    indexes: [
      { type: 'Index', columns: ['module'] },
      { type: 'Index', columns: ['module', 'sort_order'] },
    ],
  },
};

export default policyCatalogSchema;
