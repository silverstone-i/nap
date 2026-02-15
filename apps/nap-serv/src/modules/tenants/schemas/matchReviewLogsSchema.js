/**
 * @file Schema definition for admin.match_review_logs table
 * @module tenants/schemas/matchReviewLogsSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const matchReviewLogsSchema = {
  dbSchema: 'admin',
  table: 'match_review_logs',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'entity_type', type: 'varchar(32)', notNull: true },
    { name: 'entity_id', type: 'uuid', notNull: true },
    { name: 'match_type', type: 'varchar(32)', notNull: true },
    { name: 'match_id', type: 'uuid', default: null },
    { name: 'reviewer_id', type: 'uuid', default: null },
    { name: 'decision', type: 'varchar(16)', notNull: true },
    { name: 'notes', type: 'text', default: null },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      { type: 'Check', expression: "decision IN ('accept','reject','defer')" },
    ],
    indexes: [
      { type: 'Index', columns: ['entity_type', 'entity_id'] },
      { type: 'Index', columns: ['reviewer_id'] },
    ],
  },
};

export default matchReviewLogsSchema;
