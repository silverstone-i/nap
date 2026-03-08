/**
 * @file Schema definition for tenant-scope project_clients junction table
 * @module projects/schemas/projectClientsSchema
 *
 * Associates multiple clients with a project contract, replacing the former
 * single client_id FK on projects. Supports roles (buyer, co-buyer, guarantor)
 * and a primary client designation.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const projectClientsSchema = {
  dbSchema: 'tenantid',
  table: 'project_clients',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'project_id', type: 'uuid', notNull: true },
    { name: 'client_id', type: 'uuid', notNull: true },
    { name: 'role', type: 'varchar(32)' },
    { name: 'is_primary', type: 'boolean', notNull: true, default: false },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['project_id', 'client_id']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['project_id'],
        references: { table: 'projects', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['client_id'],
        references: { table: 'clients', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['project_id'] },
      { type: 'Index', columns: ['client_id'] },
    ],
  },
};

export default projectClientsSchema;
