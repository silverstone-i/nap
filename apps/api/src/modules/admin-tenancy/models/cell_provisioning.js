/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `admin.cell_provisioning`: one provisioning operation per cell: stage, status, attempts, and failure.
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const cellProvisioningSchema = {
  dbSchema: 'admin',
  table: 'cell_provisioning',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'cell_id', type: 'uuid', notNull: true, immutable: true },
    {
      name: 'operation_id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    {
      name: 'requested_action',
      type: 'text',
      notNull: true,
      default: 'provision',
    },
    { name: 'stage', type: 'text', notNull: true, default: 'registered' },
    { name: 'status', type: 'text', notNull: true, default: 'queued' },
    { name: 'attempts', type: 'integer', notNull: true, default: 0 },
    { name: 'failure_code', type: 'varchar(64)' },
    { name: 'started_at', type: 'timestamptz' },
    { name: 'completed_at', type: 'timestamptz' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['cell_id'], ['operation_id']],
    checks: [
      "requested_action IN ('provision', 'activate')",
      "stage IN ('registered', 'setup', 'migration', 'seed', 'activation', 'complete')",
      "status IN ('queued', 'running', 'failed', 'completed')",
      'attempts >= 0',
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['cell_id'],
        references: { schema: 'admin', table: 'cells', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [{ columns: ['status', 'stage'] }],
  },
};

/** Model for `admin.cell_provisioning`. Inherits the standard table operations only. */
export class CellProvisioning extends TableModel {
  static schema = cellProvisioningSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, cellProvisioningSchema, logger);
  }
}
