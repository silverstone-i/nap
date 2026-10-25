/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `app.files`: one row per object nap stored in the
 * tenant's bucket (M0006-02-R007). Archiving a row marks its object deleted
 * (R011). A tenant has at most one active logo.
 * Kept identical to the copy frozen in migration `001-tenant-settings`.
 */
export const filesSchema = {
  dbSchema: 'app',
  table: 'files',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', notNull: true, immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'purpose', type: 'text', notNull: true, immutable: true },
    { name: 'object_key', type: 'text', notNull: true, immutable: true },
    { name: 'content_type', type: 'text', notNull: true },
    { name: 'size_bytes', type: 'integer', notNull: true },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [
      ['tenant_id', 'object_key'],
      // Lets a profile key to a `profile_image` file of its tenant (M0006-03).
      ['tenant_id', 'id', 'purpose'],
    ],
    checks: [
      "purpose IN ('logo', 'profile_image')",
      "content_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')",
      'size_bytes BETWEEN 1 AND 2097152',
      'revision > 0',
    ],
    indexes: [
      {
        columns: ['tenant_id'],
        unique: true,
        where: "purpose = 'logo' AND deactivated_at IS NULL",
      },
    ],
  },
};

/** Model for `app.files`. Subject to the tenant row-level security rule. */
export class Files extends TableModel {
  static schema = filesSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, filesSchema, logger);
  }

  /**
   * One active file by ID, or null.
   * @param {string} id
   * @param {{tx: object}} options
   * @returns {Promise<object|null>}
   */
  async activeById(id, { tx }) {
    return tx.oneOrNone(
      'SELECT * FROM app.files WHERE id = $1 AND deactivated_at IS NULL',
      [id]
    );
  }

  /**
   * The tenant's active logo, or null.
   * @param {{tx: object, lock?: boolean}} options
   * @returns {Promise<object|null>}
   */
  async activeLogo({ tx, lock = false }) {
    return tx.oneOrNone(
      `SELECT * FROM app.files WHERE purpose = 'logo' AND deactivated_at IS NULL${lock ? ' FOR UPDATE' : ''}`
    );
  }

  /**
   * Record a stored object.
   * @param {{id: string, tenant_id: string, purpose: string, object_key: string, content_type: string, size_bytes: number}} row
   * @param {string} actorId Uploader, recorded in `created_by`.
   * @param {{tx: object}} options
   * @returns {Promise<object>}
   */
  async record(row, actorId, { tx }) {
    return tx.one(
      `INSERT INTO app.files
         (id, tenant_id, purpose, object_key, content_type, size_bytes, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING *`,
      [
        row.id,
        row.tenant_id,
        row.purpose,
        row.object_key,
        row.content_type,
        row.size_bytes,
        actorId,
      ]
    );
  }

  /**
   * Archive a file whose object is being deleted (R011).
   * @param {string} id
   * @param {string} actorId
   * @param {{tx: object}} options
   * @returns {Promise<void>}
   */
  async archive(id, actorId, { tx }) {
    await tx.none(
      `UPDATE app.files
          SET deactivated_at = now(), revision = revision + 1, updated_by = $2
        WHERE id = $1 AND deactivated_at IS NULL`,
      [id, actorId]
    );
  }
}
