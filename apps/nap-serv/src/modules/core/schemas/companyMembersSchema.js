/**
 * @file Schema definition for tenant-scope company_members table (RBAC Layer 2)
 * @module core/schemas/companyMembersSchema
 *
 * Maps users to inter-companies for data-scope enforcement.
 * When a role has scope = 'assigned_companies', the user only sees data
 * from projects belonging to their assigned inter-companies.
 *
 * FK to inter_companies is added via ALTER TABLE in migration (cross-module dependency).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const companyMembersSchema = {
  dbSchema: 'public',
  table: 'company_members',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', default: null },
    { name: 'company_id', type: 'uuid', notNull: true },
    { name: 'user_id', type: 'uuid', notNull: true },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['company_id', 'user_id']],
    foreignKeys: [],
    indexes: [
      { type: 'Index', columns: ['company_id'] },
      { type: 'Index', columns: ['user_id'] },
      { type: 'Index', columns: ['user_id', 'company_id'] },
    ],
  },
};

export default companyMembersSchema;
