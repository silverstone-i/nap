/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';

export type ProbeRow = {
  id: string;
  tenant_id: string;
  code: string;
  parent_id: string | null;
  payload: string;
};

const schema: TableSchema = {
  dbSchema: 'app',
  table: 'isolation_probe',
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'code', type: 'text', notNull: true },
    { name: 'parent_id', type: 'uuid' },
    { name: 'payload', type: 'text', notNull: true, default: "''" },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [
      ['tenant_id', 'id'],
      ['tenant_id', 'code'],
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'parent_id'],
        references: {
          schema: 'app',
          table: 'isolation_probe',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [{ columns: ['tenant_id', 'parent_id'] }],
  },
};

/** Exercise the same model binding used by future tenant-owned modules. */
export class IsolationProbe extends TableModel<ProbeRow> {
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
}
