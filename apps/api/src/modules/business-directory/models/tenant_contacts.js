/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DirectoryModel } from './directoryModel.js';

/**
 * Schema object for `app.tenant_contacts`: the tenant's primary and billing contacts (M0005-R018). An employee holds each designation at most once.
 * Kept identical to the copy frozen in migration `001-business-directory`.
 */
export const tenantContactsSchema = {
  dbSchema: 'app',
  table: 'tenant_contacts',
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
    { name: 'party_id', type: 'uuid', notNull: true, immutable: true },
    {
      name: 'designation',
      type: 'varchar(16)',
      notNull: true,
      immutable: true,
    },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: ["designation IN ('primary', 'billing')", 'revision > 0'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'party_id'],
        references: {
          schema: 'app',
          table: 'people',
          columns: ['tenant_id', 'party_id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        columns: ['party_id', 'designation'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      { columns: ['designation'] },
    ],
  },
};

/** Model for `app.tenant_contacts`. Subject to the tenant row-level security rule. */
export class TenantContacts extends DirectoryModel {
  static schema = tenantContactsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, tenantContactsSchema, logger);
  }
}
