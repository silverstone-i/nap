/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `admin.tenant_contacts`: Napsoft's copy of each customer
 * tenant's primary and billing contacts, written only by sync delivery
 * (I0013-R015, R016).
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
    { name: 'billing_phone', type: 'text' },
    {
      name: 'is_primary_contact',
      type: 'boolean',
      notNull: true,
      default: false,
    },
    {
      name: 'is_billing_contact',
      type: 'boolean',
      notNull: true,
      default: false,
    },
    { name: 'revision', type: 'integer', notNull: true },
  ],
  constraints: {
    primaryKey: ['tenant_id', 'party_id'],
    checks: ['revision > 0', 'is_primary_contact OR is_billing_contact'],
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
