/**
 * @file Schema definition for tenant-scope projects table
 * @module projects/schemas/projectsSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const projectsSchema = {
  dbSchema: 'tenantid',
  table: 'projects',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'company_id', type: 'uuid' },
    { name: 'client_id', type: 'uuid' },
    { name: 'address_id', type: 'uuid' },
    { name: 'project_code', type: 'varchar(32)', notNull: true },
    { name: 'name', type: 'varchar(255)', notNull: true },
    { name: 'description', type: 'text' },
    { name: 'notes', type: 'text' },
    { name: 'status', type: 'varchar(20)', notNull: true, default: 'planning' },
    { name: 'contract_amount', type: 'numeric(14,2)' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'project_code']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['company_id'],
        references: { table: 'inter_companies', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['client_id'],
        references: { table: 'clients', columns: ['id'] },
        onDelete: 'SET NULL',
      },
      {
        type: 'ForeignKey',
        columns: ['address_id'],
        references: { table: 'addresses', columns: ['id'] },
        onDelete: 'SET NULL',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['tenant_id', 'project_code'], unique: true, where: 'deactivated_at IS NULL' },
      { type: 'Index', columns: ['company_id'] },
      { type: 'Index', columns: ['client_id'] },
      { type: 'Index', columns: ['address_id'] },
    ],
  },
};

export default projectsSchema;
