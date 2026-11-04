/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `admin.tenant_contacts`: Napsoft's copy of each customer
 * tenant's employees that hold a system contact role, with those roles
 * (I0014-R026), written only by sync delivery (I0013-R015, R016).
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const tenantContactsSchema = {
  dbSchema: 'admin',
  table: 'tenant_contacts',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  columns: [
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'party_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'first_name', type: 'varchar(160)', notNull: true },
    { name: 'last_name', type: 'varchar(160)', notNull: true },
    { name: 'email', type: 'text' },
    { name: 'phone', type: 'text' },
    { name: 'roles', type: 'text[]', notNull: true },
    { name: 'revision', type: 'integer', notNull: true },
  ],
  constraints: {
    primaryKey: ['tenant_id', 'party_id'],
    checks: [
      'revision > 0',
      'cardinality(roles) > 0',
      "roles <@ ARRAY['primary', 'billing', 'notifications']::text[]",
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

/** Model for `admin.tenant_contacts`. */
export class TenantContacts extends TableModel {
  static schema = tenantContactsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, tenantContactsSchema, logger);
  }
}
