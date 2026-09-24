/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `cell.tenants`: a copy of `admin.tenants` for the tenants in this cell.
 * Kept identical to the copy frozen in migration `001-cell-tenancy`.
 */
export const tenantsSchema = {
  dbSchema: 'cell',
  table: 'tenants',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', notNull: true, immutable: true },
    {
      name: 'tenant_code',
      type: 'varchar(32)',
      notNull: true,
      immutable: true,
    },
    { name: 'status', type: 'text', notNull: true },
    { name: 'revision', type: 'integer', notNull: true },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: ["status IN ('pending', 'active', 'suspended')", 'revision > 0'],
  },
};

/** Model for `cell.tenants`. Inherits the standard table operations only. */
export class Tenants extends TableModel {
  static schema = tenantsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, tenantsSchema, logger);
  }
}
