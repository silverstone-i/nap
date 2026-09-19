/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';
import { withEventErrors } from '../domain/errors.js';
import {
  EVENT_INSERT_COLUMNS,
  EVENT_VIEW_COLUMNS,
  parseEvent,
} from '../domain/events.js';

/**
 * Schema object for `admin.managed_events`: append-only administrative events. Actor references are values, not foreign keys.
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const managedEventsSchema = {
  dbSchema: 'admin',
  table: 'managed_events',
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'deduplication_key', type: 'uuid', notNull: true, immutable: true },
    {
      name: 'occurred_at',
      type: 'timestamptz',
      notNull: true,
      default: 'now()',
      immutable: true,
    },
    { name: 'request_id', type: 'uuid', immutable: true },
    { name: 'event_key', type: 'varchar(128)', notNull: true, immutable: true },
    { name: 'outcome', type: 'text', notNull: true, immutable: true },
    { name: 'actor_id', type: 'uuid', immutable: true },
    { name: 'effective_user_id', type: 'uuid', immutable: true },
    { name: 'tenant_id', type: 'uuid', immutable: true },
    { name: 'target_type', type: 'varchar(64)', immutable: true },
    { name: 'target_id', type: 'uuid', immutable: true },
    { name: 'session_id', type: 'uuid', immutable: true },
    { name: 'reason', type: 'varchar(512)', immutable: true },
    {
      name: 'details',
      type: 'jsonb',
      notNull: true,
      default: "'{}'::jsonb",
      immutable: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['deduplication_key']],
    checks: ["outcome IN ('succeeded', 'failed', 'denied')"],
    indexes: [
      { columns: ['occurred_at'] },
      { columns: ['actor_id', 'occurred_at'] },
      { columns: ['tenant_id', 'occurred_at'] },
      { columns: ['event_key', 'occurred_at'] },
    ],
  },
};

const insertColumns = EVENT_INSERT_COLUMNS.join(',');
const returnColumns = EVENT_VIEW_COLUMNS.join(',');
const insertPlaceholders = EVENT_INSERT_COLUMNS.map(
  (column, index) => `$${index + 1}${column === 'details' ? '::jsonb' : ''}`
).join(',');

/** Model for `admin.managed_events`. Adds the only runtime event-write method. */
export class ManagedEvents extends TableModel {
  static schema = managedEventsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, managedEventsSchema, logger);
  }

  /**
   * Read one page of events, newest first.
   *
   * Written as raw SQL rather than through `findAfterCursor` because that
   * helper builds its cursor from the returned row, where `occurred_at` has
   * already become a JavaScript `Date`. PostgreSQL stores `timestamptz` to the
   * microsecond and a `Date` holds only milliseconds, so a cursor built that
   * way is rounded down, and every row falling in the truncated remainder is
   * skipped on the next page. `cursor_at` carries the full stored precision as
   * text and is stripped from the rows before they are returned.
   * @param {object[]} conditions pg-schemata condition objects, joined with AND.
   * @param {number} limit Rows per page, 1 to 100.
   * @param {{occurred_at: string, id: string}|null} after Position to resume from, or `null` for the first page.
   * @returns {Promise<{rows: object[], nextCursor: {occurred_at: string, id: string}|null}>}
   */
  async page(conditions, limit, after) {
    const values = [];
    const where = [];
    if (conditions.length)
      where.push(
        this.buildCondition([{ $and: conditions }], 'AND', values, false)
      );
    if (after) {
      values.push(after.occurred_at, after.id);
      where.push(
        `(occurred_at,id) < ($${values.length - 1}::timestamptz,$${values.length}::uuid)`
      );
    }
    values.push(limit + 1);
    // One row past the page, so a full page is distinguishable from a last one.
    const fetched = await this.db.any(
      `SELECT ${returnColumns},
              to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
         FROM ${this.schemaName}.${this.tableName}
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY occurred_at DESC, id DESC
        LIMIT $${values.length}`,
      values
    );
    const hasMore = fetched.length > limit;
    const rows = hasMore ? fetched.slice(0, limit) : fetched;
    const last = hasMore ? rows.at(-1) : undefined;
    return {
      rows: rows.map(row =>
        Object.fromEntries(
          EVENT_VIEW_COLUMNS.map(column => [column, row[column]])
        )
      ),
      nextCursor: last ? { occurred_at: last.cursor_at, id: last.id } : null,
    };
  }

  /**
   * Append one catalogue event, or return the one an earlier attempt stored.
   *
   * Pass `tx` for a successful mutation so the source row and its event commit
   * or roll back together; a failure inside the transaction therefore rolls the
   * mutation back, which is the `503 AUDIT_UNAVAILABLE` the PRD requires.
   * Denied and failed attempts append without `tx`, after the source
   * transaction has already rolled back.
   *
   * `ON CONFLICT DO NOTHING` is what makes a retry idempotent. It must not
   * become `DO UPDATE`: the `protect_event` trigger fires `BEFORE UPDATE` and
   * would raise `23514`, turning a repeated operation into a failure.
   * @param {unknown} event
   * @param {{tx?: import('pg-promise').IDatabase<unknown>}} [options]
   * @returns {Promise<object>} The stored event, or the existing one for a repeated deduplication key.
   * @throws {AdminEventError} `INVALID_INPUT`, `CONFLICT`, or `AUDIT_UNAVAILABLE`
   */
  async append(event, { tx } = {}) {
    const row = parseEvent(event);
    const values = EVENT_INSERT_COLUMNS.map(column =>
      column === 'details' ? JSON.stringify(row.details) : row[column]
    );
    const executor = tx ?? this.db;
    const table = `${this.schemaName}.${this.tableName}`;
    return withEventErrors(async () => {
      const inserted = await executor.oneOrNone(
        `INSERT INTO ${table} (${insertColumns})
         VALUES (${insertPlaceholders})
         ON CONFLICT (deduplication_key) DO NOTHING
         RETURNING ${returnColumns}`,
        values
      );
      if (inserted) return inserted;
      return await executor.one(
        `SELECT ${returnColumns} FROM ${table} WHERE deduplication_key=$1`,
        [row.deduplication_key]
      );
    }, 'AUDIT_UNAVAILABLE');
  }
}
