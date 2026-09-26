/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Compare a DTO value with a stored column value. Values arrive from
 * pg-promise as strings, booleans, numbers, or `Date`s, so compare their
 * string forms and treat `undefined` as `null`.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function sameValue(a, b) {
  const left = a ?? null;
  const right = b ?? null;
  if (left === null || right === null) return left === right;
  const text = value =>
    value instanceof Date ? value.toISOString() : String(value);
  return text(left) === text(right);
}

/**
 * Copy a DTO without its `revision`: the model owns that column.
 * @param {object} dto
 * @returns {object}
 */
function withoutRevision(dto) {
  const copy = { ...dto };
  delete copy.revision;
  return copy;
}

/**
 * The text an upsert hashes into its advisory-lock key: the table name and
 * the record's conflict values. Exported so tests can find the lock.
 * @param {string} table Qualified table name, such as `admin.tenants`.
 * @param {string[]} conflictColumns
 * @param {object} record
 * @returns {string}
 */
export function upsertLockText(table, conflictColumns, record) {
  return `${table}|${JSON.stringify(conflictColumns.map(column => String(record[column])))}`;
}

/**
 * Add `revision` to an upsert's explicit update columns, once. `null` means
 * "every column" to `TableModel`, which already includes `revision`.
 * @param {string[]|null} updateColumns
 * @returns {string[]|null}
 */
function withRevisionColumn(updateColumns) {
  if (!updateColumns || updateColumns.includes('revision'))
    return updateColumns;
  return [...updateColumns, 'revision'];
}

/**
 * Revisions of `rows`, keyed by ID.
 * @param {object[]} rows
 * @returns {Map<string, number>}
 */
function revisionsOf(rows) {
  return new Map(rows.map(row => [String(row.id), row.revision]));
}

/**
 * The `returning` list a bulk write runs with, so the outbox can find the
 * written rows by `id`.
 * @param {string[]|null} returning
 * @returns {string[]}
 */
function withId(returning) {
  if (!Array.isArray(returning) || returning.length === 0) return ['id'];
  return returning.includes('id') || returning.includes('*')
    ? returning
    : [...returning, 'id'];
}

/**
 * Give a bulk write's result the shape the caller asked for: a row count
 * without `returning`, else the rows with only the requested columns.
 * @param {object[]} rows
 * @param {string[]|null} returning
 * @returns {number|object[]}
 */
function shaped(rows, returning) {
  if (!Array.isArray(returning) || returning.length === 0) return rows.length;
  if (returning.includes('id') || returning.includes('*')) return rows;
  return rows.map(row => {
    const copy = { ...row };
    delete copy.id;
    return copy;
  });
}

/**
 * Table model for an admin row copied into cells (I0004-R010, R012).
 *
 * Every write that changes a copied column, or soft-deletes or restores the
 * row, increments `revision` by one in the caller's transaction. A write that
 * changes no copied column leaves `revision` alone, and a new row starts at
 * 1. The subclass names its copied columns in `static revisionedColumns`.
 * A caller-supplied `revision` is always ignored.
 *
 * Each write locks the rows it will change, compares them with the new
 * values, and then delegates to `TableModel`. Without `tx`, each runs in its
 * own transaction.
 *
 * Each write whose `revision` changes also inserts one `admin.outbox` row
 * per changed row, holding `static snapshot(row)` (I0004-R011). Callers pass
 * `actorId` for the outbox row's `created_by`; system writes leave it null.
 *
 * The upserts first take a transaction-scoped advisory lock on each conflict
 * key, so two upserts of the same new row run one after the other and the
 * second sees the first one's row and revision.
 */
export class RevisionedTableModel extends TableModel {
  /** @type {readonly string[]} */
  static revisionedColumns = [];

  /** The `admin.outbox` topic for this table's rows (I0004-R011). */
  static outboxTopic = null;

  /**
   * The snapshot a cell copy is built from (I0004-R013).
   * @returns {object}
   */
  static snapshot() {
    throw new Error('snapshot must be overridden');
  }

  /**
   * The tenant a row belongs to.
   * @param {object} row
   * @returns {string}
   */
  static tenantIdOf(row) {
    return row[this.tenantColumn];
  }

  /** The column holding a row's tenant. */
  static tenantColumn = 'tenant_id';

  /**
   * The current snapshot of every row, archived or not, of the given
   * tenants, as `admin.outbox` rows for the backfill (I0004-R019).
   * @param {string[]} tenantIds
   * @param {{tx: object}} options
   * @returns {Promise<object[]>}
   */
  async currentSnapshots(tenantIds, { tx }) {
    if (tenantIds.length === 0) return [];
    const model = this.constructor;
    const rows = await tx.any(
      `SELECT * FROM ${this._table()} WHERE ${model.tenantColumn} = ANY($1::uuid[])`,
      [tenantIds]
    );
    return rows.map(row => ({
      tenant_id: model.tenantIdOf(row),
      topic: model.outboxTopic,
      entity_id: row.id,
      revision: row.revision,
      payload: model.snapshot(row),
    }));
  }

  /**
   * Write one `admin.outbox` row for each of the given rows whose revision
   * differs from `before` (absent means a new row), in the caller's
   * transaction (I0004-R011). A failed insert fails the write.
   * @param {object} t
   * @param {string[]} ids
   * @param {Map<string, number>} before
   * @param {string|null|undefined} actorId
   * @returns {Promise<void>}
   */
  async _emit(t, ids, before, actorId) {
    const unique = [...new Set(ids.map(String))];
    if (unique.length === 0) return;
    const rows = await t.any(
      `SELECT * FROM ${this._table()} WHERE id = ANY($1::uuid[])`,
      [unique]
    );
    const model = this.constructor;
    const changes = rows
      .filter(row => before.get(String(row.id)) !== row.revision)
      .map(row => ({
        tenant_id: model.tenantIdOf(row),
        topic: model.outboxTopic,
        entity_id: row.id,
        revision: row.revision,
        payload: JSON.stringify(model.snapshot(row)),
        created_by: actorId ?? null,
        updated_by: actorId ?? null,
      }));
    if (changes.length === 0) return;
    const columns = new this.pgp.helpers.ColumnSet(
      [
        'tenant_id',
        'topic',
        'entity_id',
        'revision',
        { name: 'payload', cast: 'jsonb' },
        'created_by',
        'updated_by',
      ],
      { table: { schema: 'admin', table: 'outbox' } }
    );
    await t.none(this.pgp.helpers.insert(changes, columns));
  }

  /**
   * Run `work` on the caller's transaction, or in a new one.
   * @template T
   * @param {object|null|undefined} tx
   * @param {(t: object) => Promise<T>} work
   * @returns {Promise<T>}
   */
  _withTx(tx, work) {
    return tx ? work(tx) : this.db.tx(work);
  }

  /** @returns {string} */
  _table() {
    return `${this.schemaName}.${this.tableName}`;
  }

  /** @returns {string} */
  _activeCheck() {
    return this.schema.softDelete ? ' AND deactivated_at IS NULL' : '';
  }

  /**
   * Whether writing `dto` would change a copied column of `row`.
   * @param {object} dto
   * @param {object} row
   * @param {readonly string[]} [columns] Columns the write may change.
   * @returns {boolean}
   */
  _changes(dto, row, columns = Object.keys(dto)) {
    return this.constructor.revisionedColumns.some(
      column =>
        columns.includes(column) &&
        Object.prototype.hasOwnProperty.call(dto, column) &&
        !sameValue(dto[column], row[column])
    );
  }

  /**
   * Increment `revision` on the given rows.
   * @param {object} t
   * @param {string[]} ids
   * @returns {Promise<void>}
   */
  async _increment(t, ids) {
    if (ids.length === 0) return;
    await t.none(
      `UPDATE ${this._table()} SET revision = revision + 1 WHERE id = ANY($1::uuid[])`,
      [ids]
    );
  }

  /**
   * Lock each record's conflict key, then the rows an upsert would conflict
   * with, keyed by their conflict values. An active row wins over an
   * archived one with the same values.
   * @param {object} t
   * @param {object[]} records
   * @param {string[]} conflictColumns
   * @returns {Promise<Map<object, object|null>>} Each input record mapped
   *   to its conflicting row, or `null`.
   */
  async _lockConflicts(t, records, conflictColumns) {
    const key = row =>
      JSON.stringify(conflictColumns.map(column => String(row[column])));
    // A row that does not exist yet cannot be row-locked, so lock its
    // conflict key instead: a second upsert of the same key waits here until
    // the first commits, then finds and row-locks the first one's row. Keys
    // are taken in sorted order so two bulk upserts cannot deadlock. The
    // key is a 64-bit hash, so unrelated keys practically never share a lock.
    // `any`, not `none`: the SELECT returns one row per key.
    await t.any(
      `SELECT pg_advisory_xact_lock(hashtextextended(k, 0))
         FROM (SELECT DISTINCT k FROM unnest($1::text[]) AS k ORDER BY k) AS keys`,
      [
        records.map(record =>
          upsertLockText(
            `${this.schema.dbSchema}.${this.schema.table}`,
            conflictColumns,
            record
          )
        ),
      ]
    );
    const tuples = records.map(record =>
      this.pgp.as.format('($1:csv)', [
        conflictColumns.map(column => record[column]),
      ])
    );
    const columns = this._columns(conflictColumns).join(', ');
    const order = this.schema.softDelete
      ? ' ORDER BY deactivated_at IS NOT NULL'
      : '';
    const rows = await t.any(
      `SELECT * FROM ${this._table()} WHERE (${columns}) IN (${tuples.join(', ')})${order} FOR UPDATE`
    );
    const found = new Map();
    for (const row of rows) if (!found.has(key(row))) found.set(key(row), row);
    return new Map(
      records.map(record => [record, found.get(key(record)) ?? null])
    );
  }

  /**
   * Give each upsert record the `revision` it must end at: 1 for a new row,
   * the existing revision for an unchanged row, or one more for a changed row.
   * @param {object[]} records
   * @param {Map<object, object|null>} existing
   * @param {string[]} conflictColumns
   * @param {string[]|null} updateColumns
   * @returns {object[]}
   */
  _upsertRevisions(records, existing, conflictColumns, updateColumns) {
    return records.map(record => {
      const row = existing.get(record);
      if (!row) return { ...record, revision: 1 };
      const columns =
        updateColumns ??
        Object.keys(record).filter(column => !conflictColumns.includes(column));
      const revision = this._changes(record, row, columns)
        ? row.revision + 1
        : row.revision;
      return { ...record, revision };
    });
  }

  /**
   * Insert a row at revision 1, whatever `revision` the caller supplies,
   * and its outbox row.
   * @param {object} dto
   * @param {{tx?: object, actorId?: string|null}} [options]
   * @returns {Promise<object>}
   */
  async insert(dto, { tx, actorId } = {}) {
    if (dto === null || typeof dto !== 'object' || Array.isArray(dto))
      return super.insert(dto, { tx });
    return this._withTx(tx, async t => {
      const row = await super.insert({ ...dto, revision: 1 }, { tx: t });
      await this._emit(t, [row.id], new Map(), actorId);
      return row;
    });
  }

  /**
   * Insert rows at revision 1, whatever `revision` the caller supplies, and
   * their outbox rows. `importFromSpreadsheet` inserts through this method.
   * @param {object[]} records
   * @param {string[]|null} [returning]
   * @param {{tx?: object, actorId?: string|null}} [options]
   * @returns {Promise<unknown>}
   */
  async bulkInsert(records, returning = null, { tx = null, actorId } = {}) {
    if (!Array.isArray(records) || records.length === 0)
      return super.bulkInsert(records, returning, { tx });
    return this._withTx(tx, async t => {
      const rows = await super.bulkInsert(
        records.map(record =>
          record !== null &&
          typeof record === 'object' &&
          !Array.isArray(record)
            ? { ...record, revision: 1 }
            : record
        ),
        withId(returning),
        { tx: t }
      );
      await this._emit(
        t,
        rows.map(row => row.id),
        new Map(),
        actorId
      );
      return shaped(rows, returning);
    });
  }

  /**
   * Update a row, incrementing `revision` and writing an outbox row when a
   * copied column changes.
   * @param {string} id
   * @param {object} dto
   * @param {{tx?: object, actorId?: string|null}} [options]
   * @returns {Promise<object|null>}
   */
  async update(id, dto, { tx, actorId } = {}) {
    if (dto === null || typeof dto !== 'object' || Array.isArray(dto))
      return super.update(id, dto, { tx });
    const rest = withoutRevision(dto);
    return this._withTx(tx, async t => {
      const current = await t.oneOrNone(
        `SELECT * FROM ${this._table()} WHERE id=$1${this._activeCheck()} FOR UPDATE`,
        [id]
      );
      if (!current) return null;
      const changed = this._changes(rest, current);
      const next = changed ? { ...rest, revision: current.revision + 1 } : rest;
      const row = await super.update(id, next, { tx: t });
      if (changed)
        await this._emit(
          t,
          [current.id],
          new Map([[String(current.id), current.revision]]),
          actorId
        );
      return row;
    });
  }

  /**
   * Update matching rows, incrementing `revision` and writing an outbox row
   * for each row whose copied columns change.
   * @param {object|object[]} where
   * @param {object} updates
   * @param {{includeDeactivated?: boolean, tx?: object, actorId?: string|null}} [options]
   * @returns {Promise<number>}
   */
  async updateWhere(where, updates, options = {}) {
    if (
      updates === null ||
      typeof updates !== 'object' ||
      Array.isArray(updates)
    )
      return super.updateWhere(where, updates, options);
    const { includeDeactivated = false, tx = null, actorId } = options;
    const rest = withoutRevision(updates);
    return this._withTx(tx, async t => {
      const { clause, values } = this.buildWhereClause(
        where,
        true,
        [],
        'AND',
        includeDeactivated
      );
      const rows = await t.any(
        `SELECT * FROM ${this._table()} WHERE ${clause} FOR UPDATE`,
        values
      );
      const count = await super.updateWhere(where, rest, {
        includeDeactivated,
        tx: t,
      });
      const changed = rows
        .filter(row => this._changes(rest, row))
        .map(row => row.id);
      await this._increment(t, changed);
      await this._emit(t, changed, revisionsOf(rows), actorId);
      return count;
    });
  }

  /**
   * Update rows by ID, incrementing `revision` and writing an outbox row for
   * each row whose copied columns change.
   * @param {object[]} records Each includes `id`.
   * @param {string[]|null} [returning]
   * @param {{tx?: object, actorId?: string|null}} [options]
   * @returns {Promise<unknown[]>}
   */
  async bulkUpdate(records, returning = null, { tx = null, actorId } = {}) {
    if (!Array.isArray(records) || records.length === 0)
      return super.bulkUpdate(records, returning, { tx });
    return this._withTx(tx, async t => {
      const rows = await t.any(
        `SELECT * FROM ${this._table()} WHERE id = ANY($1::uuid[])${this._activeCheck()} FOR UPDATE`,
        [records.map(record => record.id)]
      );
      const byId = new Map(rows.map(row => [String(row.id), row]));
      const changed = [];
      const next = records.map(record => {
        const rest = withoutRevision(record);
        const row = byId.get(String(record.id));
        if (!row || !this._changes(rest, row)) return rest;
        changed.push(row.id);
        return { ...rest, revision: row.revision + 1 };
      });
      const result = await super.bulkUpdate(next, returning, { tx: t });
      await this._emit(t, changed, revisionsOf(rows), actorId);
      return result;
    });
  }

  /**
   * Insert a row, or update the conflicting one, setting `revision` as
   * `_upsertRevisions` describes and writing an outbox row when it changes.
   * @param {object} dto
   * @param {string[]} conflictColumns
   * @param {string[]|null} [updateColumns]
   * @param {{tx?: object, actorId?: string|null}} [options]
   * @returns {Promise<object>}
   */
  async upsert(
    dto,
    conflictColumns,
    updateColumns = null,
    { tx, actorId } = {}
  ) {
    if (
      dto === null ||
      typeof dto !== 'object' ||
      Array.isArray(dto) ||
      !Array.isArray(conflictColumns) ||
      conflictColumns.length === 0
    )
      return super.upsert(dto, conflictColumns, updateColumns, { tx });
    const rest = withoutRevision(dto);
    return this._withTx(tx, async t => {
      const existing = await this._lockConflicts(t, [rest], conflictColumns);
      const [next] = this._upsertRevisions(
        [rest],
        existing,
        conflictColumns,
        updateColumns
      );
      const row = await super.upsert(
        next,
        conflictColumns,
        withRevisionColumn(updateColumns),
        { tx: t }
      );
      await this._emit(
        t,
        [row.id],
        revisionsOf([...existing.values()].filter(Boolean)),
        actorId
      );
      return row;
    });
  }

  /**
   * Insert rows, or update the conflicting ones, setting each `revision` as
   * `_upsertRevisions` describes and writing an outbox row for each change.
   * @param {object[]} records
   * @param {string[]} conflictColumns
   * @param {string[]|null} [updateColumns]
   * @param {string[]|null} [returning]
   * @param {{tx?: object, actorId?: string|null}} [options]
   * @returns {Promise<unknown>}
   */
  async bulkUpsert(
    records,
    conflictColumns,
    updateColumns = null,
    returning = null,
    { tx, actorId } = {}
  ) {
    if (
      !Array.isArray(records) ||
      records.length === 0 ||
      !Array.isArray(conflictColumns) ||
      conflictColumns.length === 0
    )
      return super.bulkUpsert(
        records,
        conflictColumns,
        updateColumns,
        returning,
        { tx }
      );
    const rest = records.map(withoutRevision);
    return this._withTx(tx, async t => {
      const existing = await this._lockConflicts(t, rest, conflictColumns);
      const next = this._upsertRevisions(
        rest,
        existing,
        conflictColumns,
        updateColumns
      );
      const rows = await super.bulkUpsert(
        next,
        conflictColumns,
        withRevisionColumn(updateColumns),
        withId(returning),
        { tx: t }
      );
      await this._emit(
        t,
        rows.map(row => row.id),
        revisionsOf([...existing.values()].filter(Boolean)),
        actorId
      );
      return shaped(rows, returning);
    });
  }

  /**
   * Soft-delete matching active rows, incrementing each one's `revision`
   * and writing its outbox row.
   * @param {object|object[]} where
   * @param {{tx?: object, actorId?: string|null}} [options]
   * @returns {Promise<number>}
   */
  async removeWhere(where, { tx, actorId } = {}) {
    return this._withTx(tx, async t => {
      const { clause, values } = this.buildWhereClause(where);
      const rows = await t.any(
        `SELECT id, revision FROM ${this._table()} WHERE ${clause} FOR UPDATE`,
        values
      );
      await this._increment(
        t,
        rows.map(row => row.id)
      );
      const count = await super.removeWhere(where, { tx: t });
      await this._emit(
        t,
        rows.map(row => row.id),
        revisionsOf(rows),
        actorId
      );
      return count;
    });
  }

  /**
   * Restore matching soft-deleted rows, incrementing each one's `revision`
   * and writing its outbox row.
   * @param {object|object[]} where
   * @param {{tx?: object, actorId?: string|null}} [options]
   * @returns {Promise<number>}
   */
  async restoreWhere(where, { tx, actorId } = {}) {
    return this._withTx(tx, async t => {
      const { clause, values } = this.buildWhereClause(
        where,
        true,
        [],
        'AND',
        true
      );
      const rows = await t.any(
        `SELECT id, revision FROM ${this._table()}
          WHERE (${clause}) AND deactivated_at IS NOT NULL FOR UPDATE`,
        values
      );
      await this._increment(
        t,
        rows.map(row => row.id)
      );
      const count = await super.restoreWhere(where, { tx: t });
      await this._emit(
        t,
        rows.map(row => row.id),
        revisionsOf(rows),
        actorId
      );
      return count;
    });
  }
}
