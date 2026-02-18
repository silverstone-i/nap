/**
 * @file Schema definition for admin.impersonation_logs table
 * @module tenants/schemas/impersonationLogsSchema
 *
 * Audit trail for NapSoft user impersonation sessions.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const impersonationLogsSchema = {
  dbSchema: 'admin',
  table: 'impersonation_logs',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'impersonator_id', type: 'uuid', notNull: true },
    { name: 'target_user_id', type: 'uuid', notNull: true },
    { name: 'target_tenant_code', type: 'varchar(6)', notNull: true },
    { name: 'reason', type: 'text', default: null },
    { name: 'started_at', type: 'timestamptz', notNull: true, default: 'now()' },
    { name: 'ended_at', type: 'timestamptz', default: null },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      { columns: ['impersonator_id'], references: { table: 'nap_users', columns: ['id'], schema: 'admin' } },
      { columns: ['target_user_id'], references: { table: 'nap_users', columns: ['id'], schema: 'admin' } },
    ],
    indexes: [
      { type: 'Index', columns: ['impersonator_id'] },
      { type: 'Index', columns: ['target_user_id'] },
      { type: 'Index', columns: ['impersonator_id'], where: 'ended_at IS NULL' },
    ],
  },
};

export default impersonationLogsSchema;
