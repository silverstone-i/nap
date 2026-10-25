/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `app.file_storage`: the tenant's one S3-compatible
 * storage connection (M0006-02-R001). The secret access key is held only as
 * `secret_encrypted` (R002). Disconnecting deletes the row (R006).
 * Kept identical to the copy frozen in migration `001-tenant-settings`.
 */
export const fileStorageSchema = {
  dbSchema: 'app',
  table: 'file_storage',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  columns: [
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'endpoint', type: 'text', notNull: true },
    { name: 'region', type: 'text', notNull: true },
    { name: 'bucket', type: 'text', notNull: true },
    { name: 'access_key_id', type: 'text', notNull: true },
    { name: 'secret_encrypted', type: 'text', notNull: true },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['tenant_id'],
    checks: ["endpoint ~ '^https://'", 'revision > 0'],
  },
};

/** Model for `app.file_storage`. Subject to the tenant row-level security rule. */
export class FileStorage extends TableModel {
  static schema = fileStorageSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, fileStorageSchema, logger);
  }

  /**
   * The tenant's connection, or null when none is saved.
   * @param {string} tenantId
   * @param {{tx: object, lock?: boolean}} options
   * @returns {Promise<object|null>}
   */
  async byTenant(tenantId, { tx, lock = false }) {
    return tx.oneOrNone(
      `SELECT * FROM app.file_storage WHERE tenant_id = $1${lock ? ' FOR UPDATE' : ''}`,
      [tenantId]
    );
  }

  /**
   * Insert the tenant's first connection.
   * @param {object} row Column values, `tenant_id` included.
   * @param {string} actorId
   * @param {{tx: object}} options
   * @returns {Promise<object>}
   */
  async connect(row, actorId, { tx }) {
    return tx.one(
      `INSERT INTO app.file_storage
         (tenant_id, endpoint, region, bucket, access_key_id, secret_encrypted, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING *`,
      [
        row.tenant_id,
        row.endpoint,
        row.region,
        row.bucket,
        row.access_key_id,
        row.secret_encrypted,
        actorId,
      ]
    );
  }

  /**
   * Replace the connection and advance `revision`. The caller has locked
   * the row and checked the expected revision.
   * @param {object} row Column values, `tenant_id` included.
   * @param {string} actorId
   * @param {{tx: object}} options
   * @returns {Promise<object>}
   */
  async change(row, actorId, { tx }) {
    return tx.one(
      `UPDATE app.file_storage
          SET endpoint = $2, region = $3, bucket = $4, access_key_id = $5,
              secret_encrypted = $6, revision = revision + 1, updated_by = $7
        WHERE tenant_id = $1
        RETURNING *`,
      [
        row.tenant_id,
        row.endpoint,
        row.region,
        row.bucket,
        row.access_key_id,
        row.secret_encrypted,
        actorId,
      ]
    );
  }

  /**
   * Delete the tenant's connection (R006).
   * @param {string} tenantId
   * @param {{tx: object}} options
   * @returns {Promise<void>}
   */
  async disconnect(tenantId, { tx }) {
    await tx.none('DELETE FROM app.file_storage WHERE tenant_id = $1', [
      tenantId,
    ]);
  }
}
