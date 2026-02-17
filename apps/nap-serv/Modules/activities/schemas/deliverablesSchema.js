/**
 * @file Schema definition for tenant-scope deliverables table
 * @module activities/schemas/deliverablesSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const deliverablesSchema = {
  dbSchema: 'tenantid',
  table: 'deliverables',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'description', type: 'text' },
    { name: 'status', type: 'varchar(20)', notNull: true, default: 'pending' },
    { name: 'start_date', type: 'date' },
    { name: 'end_date', type: 'date' },
  ],
  constraints: {
    primaryKey: ['id'],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['status'] },
    ],
  },
};

export default deliverablesSchema;
