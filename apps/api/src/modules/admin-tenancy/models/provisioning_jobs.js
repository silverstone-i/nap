/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

export const provisioningJobsSchema = {
  dbSchema: 'admin',
  table: 'provisioning_jobs',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'membership_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'kind', type: 'text', notNull: true, immutable: true },
    { name: 'status', type: 'text', notNull: true, default: 'queued' },
    { name: 'attempts', type: 'integer', notNull: true, default: 0 },
    { name: 'result_member_id', type: 'uuid' },
    { name: 'failure_code', type: 'varchar(64)' },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "kind IN ('employee', 'client', 'vendor', 'contact')",
      "status IN ('queued', 'running', 'failed', 'completed')",
      'attempts >= 0',
      "(status = 'completed' AND result_member_id IS NOT NULL AND failure_code IS NULL) OR status <> 'completed'",
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: { schema: 'admin', table: 'tenants', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['membership_id'],
        references: {
          schema: 'admin',
          table: 'portal_user_tenants',
          columns: ['id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        columns: ['membership_id'],
        unique: true,
        where: "deactivated_at IS NULL AND status IN ('queued', 'running')",
      },
      { columns: ['status'] },
    ],
  },
};

export class ProvisioningJobs extends TableModel {
  static schema = provisioningJobsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, provisioningJobsSchema, logger);
  }
}
