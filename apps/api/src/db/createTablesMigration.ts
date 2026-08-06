/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration, orderModels } from 'pg-schemata';
import type { Migration, TableModel } from 'pg-schemata';

/**
 * The shared first migration for every module: create every table the module
 * declares, in FK-safe order. `ctx.models` holds only the owning module's
 * models, already bound to the run's schema and transaction, so the same
 * frozen object serves every descriptor — migration ids are unique per
 * module, and the tracking key is `(schema_name, module_name, migration_id)`.
 *
 * `createTable()` emits `IF NOT EXISTS` DDL throughout, so the migration is
 * safe against pre-existing tables. Do not reformat the `up` body: the
 * checksum hashes its source text, and a mismatch aborts every later run.
 */
export const createTables: Migration = defineMigration({
  id: '0001-create-tables',
  description: 'Create every table the module declares, in FK order',
  up: async ctx => {
    for (const model of orderModels(ctx.models)) {
      await (model as TableModel).createTable();
    }
  },
});
