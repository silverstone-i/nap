/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DirectoryModel } from './directoryModel.js';

/**
 * Schema object for `app.tenant_tax_ids`: a customer tenant's own tax ID.
 * The approved value is the one in effect; a submitted value waits as
 * pending until Napsoft approves or rejects it (I0013-R019–R024). Values are
 * held encrypted, with the last four characters for display.
 * Kept identical to the copy frozen in migration `001-business-directory`.
 */
export const tenantTaxIdsSchema = {
  dbSchema: 'app',
  table: 'tenant_tax_ids',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  columns: [
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'tax_id_format_id', type: 'uuid' },
    { name: 'tax_id_encrypted', type: 'text' },
    { name: 'tax_id_last4', type: 'char(4)' },
    { name: 'pending_format_id', type: 'uuid' },
    { name: 'pending_encrypted', type: 'text' },
    { name: 'pending_last4', type: 'char(4)' },
    { name: 'pending_status', type: 'text' },
    { name: 'pending_reason', type: 'text' },
    { name: 'pending_revision', type: 'integer' },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['tenant_id'],
    checks: [
      'revision > 0',
      '(tax_id_encrypted IS NULL) = (tax_id_last4 IS NULL) AND (tax_id_last4 IS NULL) = (tax_id_format_id IS NULL)',
      '(pending_encrypted IS NULL) = (pending_last4 IS NULL) AND (pending_last4 IS NULL) = (pending_format_id IS NULL) AND (pending_format_id IS NULL) = (pending_status IS NULL) AND (pending_status IS NULL) = (pending_revision IS NULL)',
      "pending_status IS NULL OR pending_status IN ('pending', 'rejected')",
      "pending_status IS DISTINCT FROM 'rejected' OR pending_reason IS NOT NULL",
      "tax_id_last4 IS NULL OR tax_id_last4 ~ '^[0-9A-Z]{4}$'",
      "pending_last4 IS NULL OR pending_last4 ~ '^[0-9A-Z]{4}$'",
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'tax_id_format_id'],
        references: {
          schema: 'app',
          table: 'tax_id_formats',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'pending_format_id'],
        references: {
          schema: 'app',
          table: 'tax_id_formats',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
  },
};

/** Model for `app.tenant_tax_ids`. */
export class TenantTaxIds extends DirectoryModel {
  static schema = tenantTaxIdsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, tenantTaxIdsSchema, logger);
  }
}
