/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DirectoryModel } from './directoryModel.js';

/**
 * Schema object for `app.contact_labels`: tenant-defined labels for emails, phones, and addresses (M0005-R017). Names are unique per group, archived labels included.
 * Kept identical to the copy frozen in migration `001-business-directory`.
 */
export const contactLabelsSchema = {
  dbSchema: 'app',
  table: 'contact_labels',
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
    { name: 'applies_to', type: 'varchar(16)', notNull: true, immutable: true },
    { name: 'name', type: 'varchar(64)', notNull: true },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [
      ['tenant_id', 'id'],
      ['tenant_id', 'applies_to', 'name'],
    ],
    checks: ["applies_to IN ('email', 'phone', 'address')", 'revision > 0'],
  },
};

/** Model for `app.contact_labels`. Subject to the tenant row-level security rule. */
export class ContactLabels extends DirectoryModel {
  static schema = contactLabelsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, contactLabelsSchema, logger);
  }
}
