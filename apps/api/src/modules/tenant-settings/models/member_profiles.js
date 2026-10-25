/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `app.member_profiles`: one row per member who has saved
 * a profile (M0006-03-R001), holding their overrides of overridable general
 * settings and their profile image, a default image or an uploaded file,
 * never both. `image_purpose` is constant so the foreign key can require a
 * `profile_image` file of the same tenant.
 * Kept identical to the copy frozen in migration `001-tenant-settings`.
 */
export const memberProfilesSchema = {
  dbSchema: 'app',
  table: 'member_profiles',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  columns: [
    { name: 'membership_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    {
      name: 'overrides',
      type: 'jsonb',
      notNull: true,
      default: "'{}'::jsonb",
    },
    { name: 'default_image', type: 'text' },
    { name: 'image_file_id', type: 'uuid' },
    {
      name: 'image_purpose',
      type: 'text',
      notNull: true,
      default: "'profile_image'",
    },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['membership_id'],
    checks: [
      "jsonb_typeof(overrides) = 'object'",
      "default_image IS NULL OR default_image IN ('orbit', 'pulse', 'wave', 'spark', 'bloom', 'tide')",
      'default_image IS NULL OR image_file_id IS NULL',
      "image_purpose = 'profile_image'",
      'revision > 0',
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'membership_id'],
        references: {
          schema: 'cell',
          table: 'tenant_members',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'image_file_id', 'image_purpose'],
        references: {
          schema: 'app',
          table: 'files',
          columns: ['tenant_id', 'id', 'purpose'],
        },
        onDelete: 'RESTRICT',
      },
    ],
  },
};

/** Model for `app.member_profiles`. Subject to the tenant row-level security rule. */
export class MemberProfiles extends TableModel {
  static schema = memberProfilesSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, memberProfilesSchema, logger);
  }

  /**
   * The member's profile, or null before they save one.
   * @param {string} membershipId
   * @param {{tx: object, lock?: boolean}} options
   * @returns {Promise<object|null>}
   */
  async byMembership(membershipId, { tx, lock = false }) {
    return tx.oneOrNone(
      `SELECT * FROM app.member_profiles WHERE membership_id = $1${lock ? ' FOR UPDATE' : ''}`,
      [membershipId]
    );
  }

  /**
   * Create the profile, or replace it and advance `revision`. The caller has
   * locked any existing row and checked the expected revision.
   * @param {{membership_id: string, tenant_id: string, overrides: object, default_image: string|null, image_file_id: string|null}} row
   * @param {string} actorId
   * @param {{tx: object}} options
   * @returns {Promise<object>}
   */
  async save(row, actorId, { tx }) {
    return tx.one(
      `INSERT INTO app.member_profiles
         (membership_id, tenant_id, overrides, default_image, image_file_id, created_by, updated_by)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $6)
       ON CONFLICT (membership_id) DO UPDATE
         SET overrides = EXCLUDED.overrides,
             default_image = EXCLUDED.default_image,
             image_file_id = EXCLUDED.image_file_id,
             revision = app.member_profiles.revision + 1,
             updated_by = EXCLUDED.updated_by
       RETURNING *`,
      [
        row.membership_id,
        row.tenant_id,
        JSON.stringify(row.overrides),
        row.default_image,
        row.image_file_id,
        actorId,
      ]
    );
  }
}
