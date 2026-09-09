/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';
const schema: TableSchema = {
  dbSchema: 'cell',
  table: 'cache_revisions',
  columns: [
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    {
      name: 'revision',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
    },
  ],
  constraints: {
    primaryKey: ['tenant_id'],
    unique: [],
    indexes: [],
    foreignKeys: [],
    checks: [],
  },
};
/**
 * Does: Reads database-owned authorization revisions without changing them.
 * Called by: cached lookup services inside the current transaction.
 * Why: ARCH-029 requires authoritative freshness even while Redis is unavailable.
 */
export class CacheRevisions extends TableModel<{
  tenant_id: string;
  revision: string;
}> {
  /** Does: Binds revision queries to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
  /** Does: Reads the current revision vector. Called by: each cached authorization lookup. */
  async current(tenantId: string) {
    const row = await this.db.oneOrNone<{ revision: string }>(
      'SELECT revision FROM cell.cache_revisions WHERE tenant_id=$1',
      [tenantId]
    );
    return row?.revision;
  }
}
