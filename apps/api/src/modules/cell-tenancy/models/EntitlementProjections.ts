/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { AuditFields, SoftDelete } from '../../../db/rowFields.js';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';
/** Does: Describes stored entitlement_projections records. Used by: transaction services. */
export type EntitlementProjectionsRow = {
  id: string;
  tenant_id: string;
  module: string;
  enabled: boolean;
  revision: number;
} & AuditFields &
  SoftDelete;
/** Does: Defines the cell.entitlement_projections schema. Used by: EntitlementProjections. */
export const schema: TableSchema = {
  dbSchema: 'cell',
  table: 'entitlement_projections',
  hasAuditFields: {
    enabled: true,
    userFields: {
      type: 'uuid',
    },
  },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    {
      name: 'tenant_id',
      type: 'uuid',
      notNull: true,
      immutable: true,
    },
    {
      name: 'module',
      type: 'text',
      notNull: true,
    },
    {
      name: 'enabled',
      type: 'boolean',
      notNull: true,
    },
    {
      name: 'revision',
      type: 'integer',
      notNull: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [
      ['tenant_id', 'id'],
      ['tenant_id', 'module'],
    ],
    foreignKeys: [],
    checks: [],
    indexes: [],
  },
};
/** Does: Reads and writes entitlement_projections. Called by: transaction-bound services. */
export class EntitlementProjections extends TableModel<EntitlementProjectionsRow> {
  /** Does: Binds the table to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }
}
