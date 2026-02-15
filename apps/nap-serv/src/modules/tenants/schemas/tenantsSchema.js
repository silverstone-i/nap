/**
 * @file Schema definition for admin.tenants table
 * @module tenants/schemas/tenantsSchema
 *
 * The admin and billing contacts for a tenant are determined by querying
 * nap_users.tenant_role ('admin' | 'billing') rather than storing FK
 * references here. When a user's tenant_role changes the old holder is
 * cleared automatically (one admin / one billing per tenant at most).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const tenantsSchema = {
  dbSchema: 'admin',
  table: 'tenants',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true },
    { name: 'company', type: 'varchar(128)', notNull: true },
    { name: 'schema_name', type: 'varchar(63)', notNull: true },
    { name: 'status', type: 'varchar(20)', notNull: true, default: 'active' },
    { name: 'tier', type: 'varchar(20)', default: 'starter' },
    { name: 'region', type: 'varchar(64)', default: null },
    { name: 'allowed_modules', type: 'jsonb', default: '[]' },
    { name: 'max_users', type: 'integer', default: 5 },
    { name: 'billing_email', type: 'varchar(128)', default: null },
    { name: 'notes', type: 'text', default: null },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_code'], ['company'], ['schema_name']],
    foreignKeys: [],
    checks: [
      { type: 'Check', expression: "status IN ('active','trial','suspended','pending')" },
      { type: 'Check', expression: "tier IN ('enterprise','growth','starter')" },
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_code'], unique: true },
      { type: 'Index', columns: ['schema_name'], unique: true },
    ],
  },
};

export default tenantsSchema;
