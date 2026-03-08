/**
 * @file Schema definition for tenant-scope number sequence state table
 * @module core/schemas/tenantNumberSequenceStateSchema
 *
 * Stores the last-used serial per (tenant, id_type, scope, period).
 * Rows are created on-demand by the numbering service via SELECT … FOR UPDATE.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const tenantNumberSequenceStateSchema = {
  dbSchema: 'tenantid',
  table: 'tenant_number_sequence_state',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'id_type', type: 'varchar(32)', notNull: true },
    { name: 'scope_id', type: 'uuid', notNull: true, default: '00000000-0000-0000-0000-000000000000' },
    { name: 'period_key', type: 'varchar(16)', notNull: true, default: 'global' },
    { name: 'last_serial', type: 'bigint', notNull: true, default: 0 },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'id_type', 'scope_id', 'period_key']],
    indexes: [{ type: 'Index', columns: ['tenant_id', 'id_type', 'scope_id', 'period_key'], unique: true }],
  },
};

export default tenantNumberSequenceStateSchema;
