/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { AuditFields, SoftDelete } from '../../../db/rowFields.js';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';

/** Does: Describes stored cells values. Used by: its repository and services. */
export type CellsRow = {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
} & AuditFields &
  SoftDelete;
/** Does: Defines admin.cells. Used by: the Cells repository. */
export const schema: TableSchema = {
  dbSchema: 'admin',
  table: 'cells',
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
      name: 'code',
      type: 'text',
      notNull: true,
    },
    {
      name: 'name',
      type: 'text',
      notNull: true,
    },
    {
      name: 'enabled',
      type: 'boolean',
      notNull: true,
      default: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [],
    indexes: [
      {
        columns: ['code'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
    ],
    foreignKeys: [],
    unique: [],
  },
};
/** Does: Persists cells records. Called by: transaction-bound services. */
export class Cells extends TableModel<CellsRow> {
  /** Does: Binds the model to a connection. Called by: repository composition. */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, schema);
  }

  /** Does: Serializes central mutations. Called by: control and selection operations before row locks. */
  async lockControl() {
    await this.db.any('SELECT pg_advisory_xact_lock(732,1)');
  }
  /**
   * Does: Returns tenant IDs whose assignments are provisioned and enabled.
   * Called by: membership listing after locking the identity's active memberships.
   * Why: One query checks all assignments without changing membership lock order.
   */
  async availableAssignments(ids: string[]) {
    return this.db.any<{ id: string }>(
      `SELECT t.id FROM admin.tenants t
       JOIN admin.cells c ON c.id=t.cell_id AND c.deactivated_at IS NULL
       WHERE t.id=ANY($1::uuid[]) AND t.deactivated_at IS NULL
         AND t.provisioned AND c.enabled`,
      [ids]
    );
  }
  /** Does: Reports whether a setup-managed cell completed activation. Called by: registry edits before enabling a cell. */
  async setupAllowsEnable(id: string) {
    const row = await this.db.oneOrNone<{ stage: string }>(
      'SELECT stage FROM admin.cell_provisioning WHERE cell_id=$1',
      [id]
    );
    return !row || row.stage === 'enabled';
  }
  /** Does: Loads tenant assignment and cell availability. Called by: request-time authorization. */
  async assignment(id: string) {
    return this.db.oneOrNone<{
      id: string;
      tenant_code: string;
      company: string;
      status: string;
      cell_id: string | null;
      provisioned: boolean;
      rbac_ready: boolean;
      revision: number;
      code: string | null;
      enabled: boolean | null;
    }>(
      `SELECT t.*, c.code,c.enabled FROM admin.tenants t LEFT JOIN admin.cells c ON c.id=t.cell_id AND c.deactivated_at IS NULL WHERE t.id=$1 AND t.deactivated_at IS NULL`,
      [id]
    );
  }
}
