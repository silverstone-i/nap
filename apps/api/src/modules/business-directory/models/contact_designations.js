/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DirectoryModel } from './directoryModel.js';

/** I0014-R001: the designations the system acts on. */
export const SYSTEM_DESIGNATIONS = Object.freeze([
  'primary',
  'billing',
  'notifications',
]);

/**
 * One holder, one designation or tag, one scope: the unique index's keys. Nulls
 * collapse so an unscoped designation counts once.
 */
const HOLDER_KEY = [
  { expression: 'coalesce(person_id, contact_method_id)' },
  { expression: 'coalesce(designation, label_id::text)' },
  {
    expression:
      "coalesce(address_id, '00000000-0000-0000-0000-000000000000'::uuid)",
  },
];

/**
 * Schema object for `app.contact_designations` (I0014 §9): the system designations and
 * designation tags each person or organization email holds. `organization_id` is
 * the holder's organization, or null for a customer tenant's employee. A
 * `billing` row may be scoped to one bill-to address or set `copy_all`,
 * never both (R013, R014).
 * Kept identical to the copy frozen in migration `001-business-directory`.
 */
export const contactDesignationsSchema = {
  dbSchema: 'app',
  table: 'contact_designations',
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
    { name: 'organization_id', type: 'uuid', immutable: true },
    { name: 'person_id', type: 'uuid', immutable: true },
    { name: 'contact_method_id', type: 'uuid', immutable: true },
    { name: 'designation', type: 'varchar(16)', immutable: true },
    { name: 'label_id', type: 'uuid', immutable: true },
    { name: 'address_id', type: 'uuid', immutable: true },
    { name: 'copy_all', type: 'boolean', notNull: true, default: false },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      'revision > 0',
      '(person_id IS NULL) <> (contact_method_id IS NULL)',
      '(designation IS NULL) <> (label_id IS NULL)',
      "designation IS NULL OR designation IN ('primary', 'billing', 'notifications')",
      "designation = 'billing' OR (address_id IS NULL AND NOT copy_all)",
      'NOT (copy_all AND address_id IS NOT NULL)',
      "designation IS DISTINCT FROM 'notifications' OR organization_id IS NULL",
      "contact_method_id IS NULL OR (designation = 'billing' AND organization_id IS NOT NULL)",
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'organization_id'],
        references: {
          schema: 'app',
          table: 'organizations',
          columns: ['tenant_id', 'party_id'],
        },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'person_id'],
        references: {
          schema: 'app',
          table: 'people',
          columns: ['tenant_id', 'party_id'],
        },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'contact_method_id'],
        references: {
          schema: 'app',
          table: 'contact_methods',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'label_id'],
        references: {
          schema: 'app',
          table: 'contact_labels',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'address_id'],
        references: {
          schema: 'app',
          table: 'addresses',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        name: 'uidx_contact_designations_holder',
        columns: HOLDER_KEY,
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      { columns: ['organization_id'] },
      { columns: ['person_id'] },
      { columns: ['contact_method_id'] },
      { columns: ['address_id'] },
    ],
  },
};

/** Model for `app.contact_designations`. Subject to the tenant row-level security rule. */
export class ContactDesignations extends DirectoryModel {
  static schema = contactDesignationsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, contactDesignationsSchema, logger);
  }
}
