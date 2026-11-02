/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `admin.tenant_tax_id_requests`: the tax ID each customer
 * tenant last submitted and Napsoft's decision on it, written only by sync
 * delivery (I0013-R020, R024). The value is held encrypted.
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const tenantTaxIdRequestsSchema = {
  dbSchema: 'admin',
  table: 'tenant_tax_id_requests',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  columns: [
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'tax_id_encrypted', type: 'text', notNull: true },
    { name: 'tax_id_last4', type: 'char(4)', notNull: true },
    { name: 'country', type: 'char(2)', notNull: true },
    { name: 'status', type: 'text', notNull: true, default: 'pending' },
    { name: 'reason', type: 'text' },
    { name: 'revision', type: 'integer', notNull: true },
  ],
  constraints: {
    primaryKey: ['tenant_id'],
    checks: [
      "status IN ('pending', 'approved', 'rejected')",
      "status <> 'rejected' OR reason IS NOT NULL",
      'revision > 0',
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: { schema: 'admin', table: 'tenants', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
  },
};

/** Model for `admin.tenant_tax_id_requests`. */
export class TenantTaxIdRequests extends TableModel {
  static schema = tenantTaxIdRequestsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, tenantTaxIdRequestsSchema, logger);
  }
}
