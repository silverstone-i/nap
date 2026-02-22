/**
 * @file Schema definition for tenant-scope state_filters table (RBAC Layer 3)
 * @module core/schemas/stateFiltersSchema
 *
 * Controls which record statuses are visible per role per resource.
 * Empty table (no row for a role+resource) = all statuses visible.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const stateFiltersSchema = {
  dbSchema: 'public',
  table: 'state_filters',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', default: null },
    { name: 'role_id', type: 'uuid', notNull: true },
    { name: 'module', type: 'varchar(32)', notNull: true },
    { name: 'router', type: 'varchar(64)', default: null },
    { name: 'visible_statuses', type: 'text[]', notNull: true },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['role_id', 'module', 'router']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['role_id'],
        references: { table: 'roles', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['role_id'] },
      { type: 'Index', columns: ['module', 'router'] },
    ],
  },
};

export default stateFiltersSchema;
