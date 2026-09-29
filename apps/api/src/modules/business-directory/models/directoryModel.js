/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Shared queries for the `app` directory tables. Every method takes the
 * caller's transaction, which `withTenantTransaction` has scoped to one
 * tenant, so row-level security limits each statement to that tenant.
 *
 * Column names in `where` and `changes` are checked against the table's
 * schema object before they reach SQL; values always travel as parameters.
 */
export class DirectoryModel extends TableModel {
  /** Primary key column: `id`, or `party_id` for the party child tables. */
  get key() {
    return this._schema.constraints.primaryKey[0];
  }

  /**
   * Throw unless every name is a column of this table.
   * @param {string[]} names
   * @returns {void}
   */
  #columns(names) {
    const known = new Set(this._schema.columns.map(c => c.name));
    for (const name of names)
      if (!known.has(name)) throw new TypeError(`Unknown column ${name}`);
  }

  /**
   * Build `col = $n` conditions for a flat equality filter.
   * @param {Record<string, unknown>} where
   * @param {unknown[]} values Receives the parameters.
   * @returns {string[]}
   */
  #conditions(where, values) {
    this.#columns(Object.keys(where));
    return Object.entries(where).map(([column, value]) => {
      values.push(value);
      return `${column} = $${values.length}`;
    });
  }

  /**
   * Rows matching an equality filter, active only unless `includeArchived`.
   * @param {Record<string, unknown>} where
   * @param {{tx: object, includeArchived?: boolean, lock?: boolean, orderBy?: string[]}} options
   * @returns {Promise<object[]>}
   */
  async rows(where, { tx, includeArchived = false, lock = false, orderBy }) {
    const values = [];
    const conditions = this.#conditions(where, values);
    if (!includeArchived) conditions.push('deactivated_at IS NULL');
    const order = orderBy ?? [this.key];
    this.#columns(order);
    return tx.any(
      `SELECT * FROM ${this.schemaName}.${this.tableName}
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY ${order.join(', ')}${lock ? ' FOR UPDATE' : ''}`,
      values
    );
  }

  /**
   * One row by primary key, archived or not.
   * @param {string} key
   * @param {{tx: object, lock?: boolean}} options
   * @returns {Promise<object|null>}
   */
  async byKey(key, { tx, lock = false }) {
    return tx.oneOrNone(
      `SELECT * FROM ${this.schemaName}.${this.tableName}
        WHERE ${this.key} = $1${lock ? ' FOR UPDATE' : ''}`,
      [key]
    );
  }

  /**
   * Rows by primary key, archived or not; missing keys are simply absent.
   * @param {string[]} keys
   * @param {{tx: object}} options
   * @returns {Promise<object[]>}
   */
  async byKeys(keys, { tx }) {
    if (keys.length === 0) return [];
    return tx.any(
      `SELECT * FROM ${this.schemaName}.${this.tableName}
        WHERE ${this.key} = ANY($1::uuid[])`,
      [keys]
    );
  }

  /**
   * Write a new revision: the given columns and, with `archived`, the
   * soft-delete state. `revision` advances by one. The caller has locked
   * the row and checked the expected revision.
   * @param {string} key
   * @param {Record<string, unknown> & {archived?: boolean}} changes
   * @param {string} actorId Portal user recorded in `updated_by`.
   * @param {{tx: object}} options
   * @returns {Promise<object>} The updated row.
   */
  async saveRevision(key, changes, actorId, { tx }) {
    const { archived, ...columns } = changes;
    const values = [key, actorId];
    const sets = this.#conditions(columns, values);
    if (archived !== undefined)
      sets.push(
        archived
          ? 'deactivated_at = COALESCE(deactivated_at, now())'
          : 'deactivated_at = NULL'
      );
    return tx.one(
      `UPDATE ${this.schemaName}.${this.tableName}
          SET ${[...sets, 'revision = revision + 1', 'updated_by = $2'].join(', ')}
        WHERE ${this.key} = $1
        RETURNING *`,
      values
    );
  }

  /**
   * Active rows of this table holding a tax ID hash, other than `excludeKey`
   * (M0005-R013).
   * @param {string} hash
   * @param {string|null} excludeKey
   * @param {{tx: object}} options
   * @returns {Promise<string[]>} Their keys.
   */
  async holdersOfTaxId(hash, excludeKey, { tx }) {
    return tx.map(
      `SELECT ${this.key} AS key FROM ${this.schemaName}.${this.tableName}
        WHERE tax_id_hash = $1 AND deactivated_at IS NULL
          AND ($2::uuid IS NULL OR ${this.key} <> $2::uuid)
        ORDER BY ${this.key}`,
      [hash, excludeKey],
      row => row.key
    );
  }
}
