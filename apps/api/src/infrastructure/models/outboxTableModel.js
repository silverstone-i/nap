/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Table model for `admin.outbox` and `cell.outbox`, which share their
 * columns (I0004 §5). Adds the reads and state changes the sync worker needs
 * (I0004-R002–R007).
 */
export class OutboxTableModel extends TableModel {
  /** @returns {string} */
  _table() {
    return `${this.schemaName}.${this.tableName}`;
  }

  /**
   * Tenants with pending rows that are due, oldest first, reading at most
   * `limit` rows (I0004-R002).
   * @param {number} limit
   * @param {{tx?: object}} [options]
   * @returns {Promise<string[]>}
   */
  async dueTenants(limit, { tx } = {}) {
    const rows = await (tx ?? this.db).any(
      `SELECT tenant_id FROM (
         SELECT tenant_id, next_attempt_at FROM ${this._table()}
          WHERE status='pending' AND next_attempt_at <= now()
          ORDER BY next_attempt_at
          LIMIT $1) AS due
        GROUP BY tenant_id
        ORDER BY min(next_attempt_at)`,
      [limit]
    );
    return rows.map(row => String(row.tenant_id));
  }

  /**
   * Lock and return a tenant's pending rows, or none when none is due yet.
   * @param {string} tenantId
   * @param {{tx: object}} options
   * @returns {Promise<object[]>}
   */
  async lockPending(tenantId, { tx }) {
    const rows = await tx.any(
      `SELECT * FROM ${this._table()}
        WHERE tenant_id=$1 AND status='pending'
        ORDER BY revision FOR UPDATE`,
      [tenantId]
    );
    const now = Date.now();
    return rows.some(row => new Date(row.next_attempt_at).getTime() <= now)
      ? rows
      : [];
  }

  /**
   * Mark rows delivered and clear their failure code (I0004-R004, R006).
   * @param {string[]} ids
   * @param {{tx: object}} options
   * @returns {Promise<void>}
   */
  async markDelivered(ids, { tx }) {
    if (ids.length === 0) return;
    await tx.none(
      `UPDATE ${this._table()}
          SET status='delivered', delivered_at=now(), failure_code=NULL
        WHERE id = ANY($1::uuid[])`,
      [ids]
    );
  }

  /**
   * Mark one row `failed` with its code; final (I0004-R032).
   * @param {string} id
   * @param {string} code
   * @param {{tx: object}} options
   * @returns {Promise<void>}
   */
  async markFailed(id, code, { tx }) {
    await tx.none(
      `UPDATE ${this._table()} SET status='failed', failure_code=$2 WHERE id=$1`,
      [id, code]
    );
  }

  /**
   * Leave rows pending after a retryable failure: one more attempt, the
   * code, and a delay of `min(2^attempts, 300)` seconds (I0004-R007).
   * @param {string[]} ids
   * @param {string} code
   * @param {{tx: object}} options
   * @returns {Promise<number>} The highest resulting `attempts`.
   */
  async markRetry(ids, code, { tx }) {
    if (ids.length === 0) return 0;
    const rows = await tx.any(
      `UPDATE ${this._table()}
          SET attempts = attempts + 1,
              failure_code = $2,
              next_attempt_at = now()
                + least(power(2, attempts + 1), 300) * interval '1 second'
        WHERE id = ANY($1::uuid[])
        RETURNING attempts`,
      [ids, code]
    );
    return Math.max(0, ...rows.map(row => row.attempts));
  }

  /**
   * The next revision for an entity's rows (I0004-R020). The caller holds a
   * lock that serializes writers for the entity.
   * @param {string} topic
   * @param {string} entityId
   * @param {{tx: object}} options
   * @returns {Promise<number>}
   */
  async nextRevision(topic, entityId, { tx }) {
    const row = await tx.one(
      `SELECT coalesce(max(revision), 0) + 1 AS revision
         FROM ${this._table()} WHERE topic=$1 AND entity_id=$2`,
      [topic, entityId]
    );
    return row.revision;
  }

  /**
   * Insert rows, skipping any (`topic`, `entity_id`, `revision`) that
   * already exists (I0004-R019).
   * @param {object[]} rows
   * @param {{tx: object}} options
   * @returns {Promise<number>} Rows inserted.
   */
  async enqueueMissing(rows, { tx }) {
    if (rows.length === 0) return 0;
    const columns = new this.pgp.helpers.ColumnSet(
      [
        'tenant_id',
        'topic',
        'entity_id',
        'revision',
        { name: 'payload', cast: 'jsonb' },
      ],
      { table: { schema: this.schema.dbSchema, table: this.schema.table } }
    );
    return tx.result(
      `${this.pgp.helpers.insert(
        rows.map(row => ({ ...row, payload: JSON.stringify(row.payload) })),
        columns
      )} ON CONFLICT (topic, entity_id, revision) DO NOTHING`,
      undefined,
      result => result.rowCount
    );
  }
}
