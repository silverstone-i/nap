/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Table model for a cell copy of an admin row. `applySnapshot` makes the copy
 * match one admin snapshot, so repeated and out-of-order deliveries leave the
 * copy at the highest revision (I0004-R015–R017, R033). The subclass names
 * the snapshot fields it stores in `static copyColumns`.
 */
export class CopyTableModel extends TableModel {
  /** @type {readonly string[]} */
  static copyColumns = [];

  /** @returns {string} */
  _table() {
    return `${this.schemaName}.${this.tableName}`;
  }

  /**
   * Lock the copy by ID; insert it if absent, update it if `revision` is
   * greater, and otherwise leave it unchanged. A `deactivated_at` in the
   * snapshot soft-deletes the copy, and a null one restores it.
   * @param {object} snapshot
   * @param {number} revision
   * @param {string|null} actorId The outbox row's `created_by`.
   * @param {{tx: object}} options
   * @returns {Promise<'inserted'|'updated'|'unchanged'>}
   */
  async applySnapshot(snapshot, revision, actorId, { tx }) {
    const softDelete = Boolean(this.schema.softDelete);
    const columns = [
      ...this.constructor.copyColumns,
      ...(softDelete ? ['deactivated_at'] : []),
    ];
    const values = Object.fromEntries(
      columns.map(column => [column, snapshot[column] ?? null])
    );
    const current = await tx.oneOrNone(
      `SELECT id, revision FROM ${this._table()} WHERE id=$1 FOR UPDATE`,
      [snapshot.id]
    );
    if (!current) {
      const row = {
        id: snapshot.id,
        ...values,
        revision,
        created_by: actorId,
        updated_by: actorId,
      };
      const set = new this.pgp.helpers.ColumnSet(Object.keys(row), {
        table: { schema: this.schema.dbSchema, table: this.schema.table },
      });
      await tx.none(this.pgp.helpers.insert(row, set));
      return 'inserted';
    }
    if (current.revision >= revision) return 'unchanged';
    const row = { ...values, revision, updated_by: actorId };
    const set = new this.pgp.helpers.ColumnSet(Object.keys(row), {
      table: { schema: this.schema.dbSchema, table: this.schema.table },
    });
    await tx.none(`${this.pgp.helpers.update(row, set)} WHERE id=$1`, [
      snapshot.id,
    ]);
    return 'updated';
  }
}
