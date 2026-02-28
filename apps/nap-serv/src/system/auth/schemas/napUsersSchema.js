/**
 * @file Schema definition for admin.nap_users table
 * @module auth/schemas/napUsersSchema
 *
 * nap_users is a pure identity/authentication table per PRD §3.2.2.
 * All personal information (name, phone, address) lives on the linked
 * entity record in the tenant schema. The link is polymorphic via
 * entity_type + entity_id. Roles are stored as a text[] on the entity
 * record — there is no role column here.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const napUsersSchema = {
  dbSchema: 'admin',
  table: 'nap_users',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'entity_type', type: 'varchar(16)', default: null },
    { name: 'entity_id', type: 'uuid', default: null },
    { name: 'email', type: 'varchar(128)', notNull: true },
    { name: 'password_hash', type: 'text', notNull: true },
    { name: 'status', type: 'varchar(20)', notNull: true, default: 'active' },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      { columns: ['tenant_id'], references: { table: 'tenants', columns: ['id'], schema: 'admin' }, onDelete: 'CASCADE' },
    ],
    checks: [
      { type: 'Check', expression: "status IN ('active','invited','locked')" },
      {
        type: 'Check',
        expression: "entity_type IS NULL OR entity_type IN ('employee','vendor','client','contact')",
      },
    ],
    indexes: [
      { type: 'Index', columns: ['email'], unique: true, where: 'deactivated_at IS NULL' },
      { type: 'Index', columns: ['entity_type', 'entity_id'], unique: true, where: 'deactivated_at IS NULL' },
      { type: 'Index', columns: ['tenant_id'] },
    ],
  },
};

export default napUsersSchema;
