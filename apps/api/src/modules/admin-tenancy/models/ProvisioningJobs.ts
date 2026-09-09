/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { AuditFields, SoftDelete } from '../../../db/rowFields.js';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';

/** Does: Describes stored provisioning_jobs values. Used by: its repository and services. */
export type ProvisioningJobsRow = {
  id: string;
  tenant_id: string;
  membership_id: string;
  record_id: string;
  vendor_id: string | null;
  kind: string;
  stage: string;
  failure_code: string | null;
} & AuditFields &
  SoftDelete;
/** Does: Defines admin.provisioning_jobs. Used by: the ProvisioningJobs repository. */
export const schema: TableSchema = {
  dbSchema: 'admin',
  table: 'provisioning_jobs',
  hasAuditFields: {
    enabled: true,
    userFields: {
      type: 'uuid',
    },
  },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    {
      name: 'tenant_id',
      type: 'uuid',
      notNull: true,
    },
    {
      name: 'membership_id',
      type: 'uuid',
      notNull: true,
    },
    {
      name: 'record_id',
      type: 'uuid',
      notNull: true,
    },
    {
      name: 'vendor_id',
      type: 'uuid',
    },
    {
      name: 'kind',
      type: 'text',
      notNull: true,
    },
    {
      name: 'stage',
      type: 'text',
      notNull: true,
    },
    {
      name: 'failure_code',
      type: 'text',
    },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "kind IN ('employee','client','vendor')",
      "stage IN ('pending','complete','failed')",
    ],
    indexes: [
      {
        columns: ['membership_id'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: {
          schema: 'admin',
          table: 'tenants',
          columns: ['id'],
        },
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
    unique: [],
  },
};
/** Does: Persists provisioning_jobs records. Called by: transaction-bound services. */
export class ProvisioningJobs extends TableModel<ProvisioningJobsRow> {
  /** Does: Binds the model to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
}
