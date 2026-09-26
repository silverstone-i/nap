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
 * The upserts first take a transaction-scoped advisory lock on each conflict
 * key, so two upserts of the same new row run one after the other and the
 * second sees the first one's row and revision.
 */
export class RevisionedTableModel extends TableModel {
  /** @type {readonly string[]} */
  static revisionedColumns = [];

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
    return this._schema.softDelete ? ' AND deactivated_at IS NULL' : '';
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
   * @returns {Promise<Map<string, object>>}
   */
  async _lockConflicts(t, records, conflictColumns) {
    const key = row =>
      JSON.stringify(conflictColumns.map(column => String(row[column])));
    // A row that does not exist yet cannot be row-locked, so lock its
    // conflict key instead: a second upsert of the same key waits here until
    // the first commits, then finds and row-locks the first one's row. Keys
    // are taken in sorted order so two bulk upserts cannot deadlock.
    await t.any(
      `SELECT pg_advisory_xact_lock(hashtext($1), hashtext(k))
         FROM (SELECT DISTINCT k FROM unnest($2::text[]) AS k ORDER BY k) AS keys`,
      [this._table(), records.map(key)]
    );
    const tuples = records.map(record =>
      this.pgp.as.format('($1:csv)', [
        conflictColumns.map(column => record[column]),
      ])
    );
    const columns = this._columns(conflictColumns).join(', ');
    const order = this._schema.softDelete
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
   * Update a row, incrementing `revision` when a copied column changes.
   * @param {string} id
   * @param {object} dto
   * @param {{tx?: object}} [options]
   * @returns {Promise<object|null>}
   */
  async update(id, dto, { tx } = {}) {
    if (dto === null || typeof dto !== 'object' || Array.isArray(dto))
      return super.update(id, dto, { tx });
    const rest = withoutRevision(dto);
    return this._withTx(tx, async t => {
      const current = await t.oneOrNone(
        `SELECT * FROM ${this._table()} WHERE id=$1${this._activeCheck()} FOR UPDATE`,
        [id]
      );
      if (!current) return null;
      const next = this._changes(rest, current)
        ? { ...rest, revision: current.revision + 1 }
        : rest;
      return super.update(id, next, { tx: t });
    });
  }

  /**
   * Update matching rows, incrementing `revision` on each row whose copied
   * columns change.
   * @param {object|object[]} where
   * @param {object} updates
   * @param {{includeDeactivated?: boolean, tx?: object}} [options]
   * @returns {Promise<number>}
   */
  async updateWhere(where, updates, options = {}) {
    if (updates === null || typeof updates !== 'object')
      return super.updateWhere(where, updates, options);
    const { includeDeactivated = false, tx = null } = options;
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
      const count = await super.updateWhere(where, rest, { ...options, tx: t });
      await this._increment(
        t,
        rows.filter(row => this._changes(rest, row)).map(row => row.id)
      );
      return count;
    });
  }

  /**
   * Update rows by ID, incrementing `revision` on each row whose copied
   * columns change.
   * @param {object[]} records Each includes `id`.
   * @param {string[]|null} [returning]
   * @param {{tx?: object}} [options]
   * @returns {Promise<unknown[]>}
   */
  async bulkUpdate(records, returning = null, { tx = null } = {}) {
    if (!Array.isArray(records) || records.length === 0)
      return super.bulkUpdate(records, returning, { tx });
    return this._withTx(tx, async t => {
      const rows = await t.any(
        `SELECT * FROM ${this._table()} WHERE id = ANY($1::uuid[])${this._activeCheck()} FOR UPDATE`,
        [records.map(record => record.id)]
      );
      const byId = new Map(rows.map(row => [String(row.id), row]));
      const next = records.map(record => {
        const rest = withoutRevision(record);
        const row = byId.get(String(record.id));
        return row && this._changes(rest, row)
          ? { ...rest, revision: row.revision + 1 }
          : rest;
      });
      return super.bulkUpdate(next, returning, { tx: t });
    });
  }

  /**
   * Insert a row, or update the conflicting one, setting `revision` as
   * `_upsertRevisions` describes.
   * @param {object} dto
   * @param {string[]} conflictColumns
   * @param {string[]|null} [updateColumns]
   * @param {{tx?: object}} [options]
   * @returns {Promise<object>}
   */
  async upsert(dto, conflictColumns, updateColumns = null, { tx } = {}) {
    if (
      dto === null ||
      typeof dto !== 'object' ||
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
      return super.upsert(
        next,
        conflictColumns,
        updateColumns && [...updateColumns, 'revision'],
        { tx: t }
      );
    });
  }

  /**
   * Insert rows, or update the conflicting ones, setting each `revision` as
   * `_upsertRevisions` describes.
   * @param {object[]} records
   * @param {string[]} conflictColumns
   * @param {string[]|null} [updateColumns]
   * @param {string[]|null} [returning]
   * @param {{tx?: object}} [options]
   * @returns {Promise<unknown>}
   */
  async bulkUpsert(
    records,
    conflictColumns,
    updateColumns = null,
    returning = null,
    { tx } = {}
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
      return super.bulkUpsert(
        next,
        conflictColumns,
        updateColumns && [...updateColumns, 'revision'],
        returning,
        { tx: t }
      );
    });
  }

  /**
   * Soft-delete matching active rows, incrementing each one's `revision`.
   * @param {object|object[]} where
   * @param {{tx?: object}} [options]
   * @returns {Promise<number>}
   */
  async removeWhere(where, { tx } = {}) {
    return this._withTx(tx, async t => {
      const { clause, values } = this.buildWhereClause(where);
      await t.none(
        `UPDATE ${this._table()} SET revision = revision + 1 WHERE ${clause}`,
        values
      );
      return super.removeWhere(where, { tx: t });
    });
  }

  /**
   * Restore matching soft-deleted rows, incrementing each one's `revision`.
   * @param {object|object[]} where
   * @param {{tx?: object}} [options]
   * @returns {Promise<number>}
   */
  async restoreWhere(where, { tx } = {}) {
    return this._withTx(tx, async t => {
      const { clause, values } = this.buildWhereClause(
        where,
        true,
        [],
        'AND',
        true
      );
      await t.none(
        `UPDATE ${this._table()} SET revision = revision + 1
          WHERE (${clause}) AND deactivated_at IS NOT NULL`,
        values
      );
      return super.restoreWhere(where, { tx: t });
    });
  }
}
