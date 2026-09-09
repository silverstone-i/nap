/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';
const schema: TableSchema = {
  dbSchema: 'admin',
  table: 'cache_revisions',
  columns: [
    { name: 'domain', type: 'text', notNull: true },
    { name: 'entity', type: 'text', notNull: true },
    {
      name: 'revision',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
    },
  ],
  constraints: {
    primaryKey: ['domain', 'entity'],
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
  domain: string;
  entity: string;
  revision: string;
}> {
  /** Does: Binds revision queries to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
  /** Does: Reads the current revision vector. Called by: each cached authorization lookup. */
  async current(dependencies: { domain: string; entity: string }[]) {
    const rows = await this.db.any<{
      domain: string;
      entity: string;
      revision: string;
    }>(
      `SELECT r.* FROM admin.cache_revisions r
       JOIN jsonb_to_recordset($1::jsonb) AS d(domain text, entity text)
       ON r.domain=d.domain AND r.entity=d.entity`,
      [JSON.stringify(dependencies)]
    );
    const revisions = dependencies.map(
      d =>
        rows.find(r => r.domain === d.domain && r.entity === d.entity)?.revision
    );
    return revisions.every(r => r !== undefined)
      ? revisions.join('.')
      : undefined;
  }
}
